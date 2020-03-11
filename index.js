require('isomorphic-fetch');
const chalk = require('chalk');
const fs = require('fs');
const cheerio = require('cheerio');
const config = require('./config');
const sleep = require('./src/sleep');
const traverseTreeNodeDeepFirst = require('./src/traverse');

// 导出类型
const exportKey ='view'; // "editor","view","export_view","styled_view","storage","anonymous_export_view"

// 文档树
let docTree = [];

// 待处理请求数量，每次请求+1，返回并完成处理时-1，请求为0表示处理完毕
let pendingCount = 0;

/**
 * 获取html文档内容
 * @param id
 * @param cb
 * @returns {Promise<Response>}
 */
const fetchContent = (id, cb) => {
  const url = `${config.wikiUrl}/rest/api/content/${id}?expand=body.${exportKey}`;

  if (pendingCount > config.maxThread) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(fetchContent(id, cb));
      }, 1000);
    });
  }

  pendingCount++;
  return fetch(url, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Basic ${new Buffer(`${config.user}:${config.password}`).toString('base64')}`
    }
  })
    .then(res => {
      const r1 = res.clone();
      return Promise.all([res.json(), r1.text()]).then(data => {
        cb({
          title: data[0].title,
          body: data[0].body[exportKey].value
        });
      });
    }).finally(() => {
      pendingCount--;
      if (pendingCount === 0) {
        generateHomePage();
      }
    });
};

/**
 * 获取子文档列表
 * @param id
 * @param cb
 * @returns {Promise<Response>}
 */
const fetchChildren = (id, cb) => {
  const url = `${config.wikiUrl}/rest/api/content/search?cql=parent=${id}&expand=history.lastUpdated`;
  return fetch(url, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Basic ${new Buffer(`${config.user}:${config.password}`).toString('base64')}`
    }
  }).then(res => {
    const r1 = res.clone();
    return Promise.all([res.json(), r1.text()]).then(data => cb(data[0]));
  });
};

/**
 * 下载图片
 * @param src
 * @param dest
 * @param cb
 */
const downloadImg = (src, dest, cb) => {
  let url = /^http(s)?:\/\//.test(src) ? src :`${config.wikiUrl}${src}`;

  if (pendingCount > config.maxThread) {
    setTimeout(() => {
      downloadImg(src, dest, cb);
    }, 100);

    return;
  }

  pendingCount++;

  fetch(url, {
    headers: {
      Authorization: `Basic ${new Buffer(`${config.user}:${config.password}`).toString('base64')}`
    }
  })
    .then(res => {
      let file = fs.createWriteStream(dest);
      res.body.pipe(file);
    }, (err) => {
      console.error(err);
    })
    .then(cb)
    .finally(() => {
      pendingCount--;

      if (pendingCount === 0) {
        generateHomePage();
      }
    });
};

/**
 * 获取图片资源
 * @param id
 * @param html
 */
const fetchImage = (id, html) => {
  let page = html;

  page = replace3(page);

  while ((/ac:structured-macro/g).test(page)) {
    page = replace1(page);
  }

  while ((/ac:image/g).test(page)) {
    page = replace2(page);
  }

  function replace1 (page) {
    let ac = (/<ac:structured-macro[\s\S]+?>([\s\S]+?)<\/ac:structured-macro>/g).exec(page);

    if ((/<ac:parameter ac:name="diagramName">([\s\S]*)<\/ac:parameter>/g).test(ac[1])) {
      let imgName = (/<ac:parameter ac:name="diagramName">([\s\S]+?)<\/ac:parameter>/g).exec(ac[1])[1];
      imgName = imgName.replace(/[ :]/g, '');

      downloadImg(`${id}/${imgName}.png`, `./build/${id}/${imgName}.png`, () => {
        console.log(chalk.green(`- File ${imgName}.png download completed`));
        console.log(`${chalk[pendingCount ? 'cyan' : 'red'](`- pendingCount: ${pendingCount}!`)}`);
      });

      return page.replace(ac[0], `<img src='./${imgName}.png' alt=${imgName}/>`);
    } else {
      let code = ac[1].replace(/<ac:parameter[\s\S]+?>[\s\S]+?<\/ac:parameter>/g, '');
      code = code.replace(/ac:plain-text-body|ac:rich-text-body/g, 'pre');
      return page.replace(ac[0], code);
    }
  }

  function replace2 (page) {
    let ac = (/<ac:image[\s\S]*?>([\s\S]+?)<\/ac:image>/g).exec(page);
    let imgName = '';

    if ((/ri:filename=/g).test(ac[1])) {
      imgName = (/ri:filename="([\s\S]+?)"/g).exec(ac[1])[1];
    } else if ((/ri:value=/g).test(ac[1])) {
      imgName = (/ri:value="([\s\S]+?)"/g).exec(ac[1])[1];
    }

    let url = (/http:\/\//g).test(imgName) ? imgName : `${id}/${imgName}`;
    imgName = (/http:\/\//g).test(imgName) ? (/[\s\S]*\/([\s\S]*.png)/g).exec(imgName)[1] : imgName;
    imgName = imgName.replace(/[ :]/g, '');
    let img = `<img src="./${imgName}" alt="${imgName}"/>`;

    downloadImg(url, `./build/${id}/${imgName}`, () => {
      console.log(chalk.green(`- File ${imgName} download completed`));
      console.log(`${chalk[pendingCount ? 'cyan' : 'red'](`- pendingCount: ${pendingCount}!`)}`);
    });

    return page.replace(ac[0], img);
  }

  function replace3 (page) {
    return page.replace(/(<img[\s\S]+?src=")([\s\S]+?)"([\s\S]+?)>/g, (match, s1, s2, s3) => {
      const src = s2;
      let imgName = src.slice(src.lastIndexOf('/') + 1,
        src.lastIndexOf('?') === -1 ? undefined : src.lastIndexOf('?'));

      downloadImg(src, `./build/${id}/${decodeURIComponent(imgName)}`, () => {
        console.log(chalk.green(`- File ${decodeURIComponent(imgName)} download completed`));
        console.log(`${chalk[pendingCount ? 'cyan' : 'red'](`- pendingCount: ${pendingCount}!`)}`);
      });

      return `${s1}./${imgName.replace('?', '%3F')}"${s3}`;
    });
  }

  return page;
};

/**
 * 处理文档节点
 * @param id
 * @param parent
 */
async function processNode(id, parent) {
  if (!id) {
    console.warn('please give an id!');
    return;
  }

  let treeNode = {};

  /**
   * 模拟自然延时, 注意必须在pendingCount++之后延时，否则 pendingCount == 0  可能误判
   */
  // await sleep(Math.random() * 1000);

  await fetchContent(id, ({title, body}) => {
    let url = `./build/${id}/index.html`;

    treeNode = {
      id,
      title,
      url,
      children: [],
    };

    // 加入文档树
    if (parent && parent.children) {
      parent.children.push(treeNode);
    } else {
      docTree = [treeNode];
      parent = docTree;
    }

    body = fetchImage(id, body);

    if (!fs.existsSync(`./build/${id}`)) {
      fs.mkdirSync(`./build/${id}`);
    }

    fs.writeFile(url, body, () => {});

    if (pendingCount === 0) {
      generateHomePage();
    }

    console.log(`${chalk.cyan(`- got ${id}!`)}`);
    console.log(`${chalk[pendingCount ? 'cyan' : 'red'](`- pendingCount: ${pendingCount}!`)}`);
  });

  fetchChildren(id, async (data) => {
    if (data.results && data.results.length) {
      data.results.map((child) => {
        processNode(child.id, treeNode);
      });
    }
  });
}

/**
 * 生成文档站首页
 */
function generateHomePage() {
  function generateSideTree(root) {
    let sideTree = '';
    let path = [];
    traverseTreeNodeDeepFirst(root, path,
      (node) => {
        // 第一次访问非叶子节点时
        if (node.children.length && !node.children.filter(node => node.visited).length) {
          sideTree += `<ul>`;
        }
        sideTree += `<li><a href="./${node.id}/index.html" onclick="handleClick(this)" target="view_frame">${node.title}</a></li>`;
      },
      (node) => {
        if (node.children.length && !node.children.filter(node => !node.visited).length) {
          sideTree += '</ul>';
        }
      });

    return sideTree;
  }

  let sideTree = generateSideTree(docTree);

  let html = fs.readFileSync('./src/asset/index.html');
  const $ = cheerio.load(html);
  $('.head').html(`<p>${config.name}</p>`);
  $('.left').html(sideTree);

  fs.writeFile(`./build/index.html`, $.root().html(), (err) => {
    console.log(err || chalk.blue('- build/index.html was created!'));
  });
}

(function main() {
  require('figlet').text('ConfluenceCrawler', (e, data) => console.log(e || data));
  config.id = process.argv[2] || config.id;
  config.name = process.argv[3] || config.name;

  console.log(`${config.id}-${config.name}`);

  if (!fs.existsSync(`./build`)) {
    fs.mkdirSync(`./build`);
  }

  processNode(config.id);
})();
