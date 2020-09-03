const { Msg } = require('../utils/msgutils');
const { ls } = require('./system_fs');

exports.configParam = [{
    name: 'root',
    desc: '根目录路径, 请保证结尾不是 "/" 示例: /a/b/c '
}];

exports.commands = ['ls'];

exports.func = async (spConfig, cache, event) => {
    let root = spConfig.root || '';
    let p2 = root + event.p2;
    switch (event.cmd) {
        case 'ls':
            return await ls(p2, event);
        default:
            return Msg.info(400, Msg.constants.No_such_command);
    }
}