'use strict';
const {
	Msg
} = require('../utils/msgutils');
const {
	OneDrive
} = require('../lib/onedriveAPI');

let onedrive;

exports.configParam = [{
	name: 'refresh_token',
	required: true,
	type: 'textarea',
	desc: '刷新令牌 refresh_token : 可从 https://point.onesrc.cn/oauth2 获取'
},
{
	name: 'root',
	desc: '根路径, 请保证末尾不是 "/"; 示例 /a/b/c 表示只选择 /a/b/c 路径下的文件展示使用, 其他对外不可见'
},
{
	name: 'oauth',
	desc: '如使用世纪互联请填1, 否则不填'
}, {
	name: 'api_url',
	desc: '如使用共享盘请填写带有共享盘id的完整链接, 请保证末尾是 "/"; 示例 https://graph.microsoft.com/v1.0/drives/b!9WuGvU98R06cKgwSEDInU_UZxi9WbrpKkJdRwfiVSrZfFsQxgwWCQYUMmTVoDnq_/'
}, {
	name: 'client_id',
	desc: '如使用自注册应用程序填写, 否则不填'
}, {
	name: 'client_secret',
	desc: '如果使用自注册应用程序填写, 否则不填'
}];

exports.commands = ['ls', 'mkdir', 'mv', 'cp', 'rm', 'ren', 'touch', 'upload'];




async function ls(path, skiptoken) {
	try {
		if (!path.endsWith('/')) { //处理文件情况
			let data = await onedrive.msGetItemInfo(path);
			return Msg.file({
				type: 0,
				name: data['name'],
				size: data['size'],
				mime: data['file']['mimeType'], //@info 暂时不处理目录不规范的情况,直接throw
				time: data['lastModifiedDateTime']
			}, data['@microsoft.graph.downloadUrl'] || data['@content.downloadUrl']);
		}
		if (path !== '/') path = path.slice(0, -1);
		let params = {
			//$top: 50
		};
		if (skiptoken && /\w*/.exec(skiptoken)) params.$skiptoken = skiptoken;
		let data = await onedrive.msGetDriveItems(path, params);
		let list = [];
		data.value.forEach(e => {
			list.push({
				type: e['file'] ? 0 : 1,
				name: e['name'],
				size: e['size'],
				mime: e['file'] ? e['file']['mimeType'] : '',
				time: e['lastModifiedDateTime'],
				url: e['@microsoft.graph.downloadUrl'] || e['@content.downloadUrl']
			});
		});
		let msg = Msg.list(list);
		if (data['@odata.nextLink']) msg.data.nextToken = /skiptoken=(\w*)/.exec(data['@odata.nextLink'])[1];
		return msg;
	} catch (error) {
		if (error.response && error.response.status === 404) return Msg.info(404);
		else throw error;
	}
}

async function mkdir(path, name) {
	await onedrive.msMkdir(path, name);
	return Msg.info(201);
}

async function mv(srcPath, desPath) {
	await onedrive.msMove(srcPath, desPath);
	return Msg.info(200);
}

async function cp(srcPath, desPath) {
	await onedrive.msCopy(srcPath, desPath);
	return Msg.info(200);
}

async function rm(path) {
	await onedrive.msDelete(path);
	return Msg.info(204);
}

async function ren(path, name) {
	await onedrive.msRename(path, name);
	return Msg.info(200);
}

async function touch(path, filename, content) {
	await onedrive.msUpload(path, filename, content);
	return Msg.info(201);
}

async function upload(filePath, fileSystemInfo, _cache) {
	let k = filePath + JSON.stringify(fileSystemInfo);
	if (_cache[k] && new Date(_cache[k].expirationDateTime) > new Date()) return Msg.html_json(200, _cache[k]);
	let res = await onedrive.msUploadSession(filePath, fileSystemInfo);
	_cache[k] = res;
	return Msg.html_json(200, res);
}

exports.func = async (spConfig, cache, event, context) => {
	onedrive = new OneDrive(spConfig['refresh_token'], spConfig['oauth'], spConfig);
	await onedrive.init((data) => {
		if ((spConfig['expires_date'] || 0) < Date.now()) {
			console.log(spConfig);
			spConfig['expires_date'] = Date.now() + 3600000 * 24 * 30;
			spConfig['refresh_token'] = data['refresh_token'];
			console.log(spConfig);
			context.saveConfig().catch((err) => {
				console.log(err.message);
			});
		}
	});
	let root = spConfig.root || '';
	let p2 = root + event.p2;
	let cmdData = event.cmdData;
	switch (event.cmd) {
		case 'ls':
			return await ls(p2, event.sp_page);
		case 'mkdir':
			return await mkdir(p2, cmdData.name);
		case 'mv':
			return await mv(p2, root + event.p2_des);
		case 'cp':
			return await cp(p2, root + event.p2_des);
		case 'rm':
			return await rm(p2);
		case 'ren':
			return await ren(p2, cmdData.name);
		case 'touch':
			return await touch(p2, cmdData.name, cmdData.content);
		case 'upload':
			return await upload(p2, cmdData.fileSystemInfo, cache);
		case 'find':
			return await find(cmdData.text);
		default:
			return Msg.info(400, Msg.constants.No_such_command);
	}
}