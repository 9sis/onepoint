'use strict';
const { Msg } = require('../utils/msgutils');
const { SharePoint } = require('../lib/sharepointAPI');
const { getmime } = require('../utils/nodeutils');

let sharepoint;

exports.configParam = [{
    name: 'share_url',
    required: true,
    desc: '分享链接, 例如 https://lovelearn-my.sharepoint.com/:f:/g/personal/admin_share_onesrc_cc/Es6CMetI4fJCr4GqWZ3uvA0BEnzJxxb4CU-iQr04VYomLQ?e=C9K35U'
}, {
    name: 'root',
    desc: '根目录路径, 请保证结尾不是 "/" 示例: /a/b/c '
}];

exports.commands = ['ls'];

async function ls(path) {
    try {
        let data = await sharepoint.spListData(path);
        let offset = (new Date().getTimezoneOffset() - data.RegionalSettingsTimeZoneBias || 0) * 60000;
        if (data.ListData.Row.length > 0) {//文件夹
            let list = [];
            data.ListData.Row.forEach(e => {
                list.push({
                    type: Number(e['FSObjType']),
                    name: e['LinkFilename'],
                    size: Number(e['SMTotalFileStreamSize']),
                    mime: Number(e['FSObjType']) ? '' : getmime(e['LinkFilename']),
                    time: new Date(new Date(e['SMLastModifiedDate']) - offset).toISOString()
                });
            });
            return Msg.list(list);
        } else {//文件 或 空文件夹
            let info = await sharepoint.spGetItemInfo(data.ListData.CurrentFolderSpItemUrl);
            if (!info.file) return Msg.list([]);//空文件夹
            return Msg.file({
                type: 0,
                name: info['name'],
                size: info['size'],
                mime: info['file']['mimeType'],
                time: new Date(new Date(info['lastModifiedDateTime']) - offset).toISOString()
            }, info['@content.downloadUrl']);
        }
    } catch (error) {
        //console.log(error);
        if (error.response && error.response.status === 404) return Msg.info(404);
        else throw error;
    }
}
exports.func = async (spConfig, cache, event) => {
    sharepoint = new SharePoint(spConfig.share_url);
    await sharepoint.init();
    let root = spConfig.root || '';
    let p2 = root + event.p2;
    switch (event.cmd) {
        case 'ls':
            return await ls(p2);
        default:
            return Msg.info(400, Msg.constants.No_such_command);
    }
}