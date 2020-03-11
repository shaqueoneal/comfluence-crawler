/**
 * 遍历树节点，深度优先
 * @param root，可以是一个数组也可以是一个对象
 * @param nodes，当前遍历路径
 * @param cb1  入栈回调
 * @param cb2  出栈回调
 * @param [stopCondition]  遍历终止条件，满足条件不会继续遍历
 * @param [childLabel] 子节点名称
 * @returns {*}
 */
const traverseTreeNodeDeepFirst = function(root, nodes, cb1, cb2, stopCondition, childLabel) {
  if (!root) {
    return root;
  }

  if (stopCondition && stopCondition(root)) {
    return root;
  }

  let childName = 'children' || childLabel;
  let node = root;

  if (root.length > 1) {
    root.map(r => traverseTreeNodeDeepFirst(r, nodes, cb1, cb2, stopCondition, childName));
  }

  if (Object.prototype.toString.call(node) === '[object Object]' || node.length === 1) { // root 是对象或者一个元素的数组才能遍历
    if (node.length === 1) {
      node = node[0];
    }

    node.visited = true;
    nodes.push(node);

    if (cb1) {
      cb1(node, nodes);
    }

    let children = node[childName];
    for (let i = 0; i < children.length; i++) {
      traverseTreeNodeDeepFirst(children[i], nodes, cb1, cb2, stopCondition, childName);
    }

    // 子节点全部遍历过
    if (children.length === children.filter(n => n.visited).length) {
      let lastNode = nodes.pop();
      if (cb2) {
        cb2(lastNode, nodes);
      }
    }
  }
  return nodes;
};

module.exports = traverseTreeNodeDeepFirst;

