'use strict';
const { Msg } = require('../utils/msgutils');
const { getmd5 } = require('../utils/nodeutils');
const { OneCache } = require('../utils/cacheutil');
const _cookie = require('cookie');
const querystring = require('querystring');

const drive_funcs = {};//云盘模块
['linux_scf', 'onedrive_graph', 'onedrive_sharepoint', 'gdrive_goindex', 'system_admin', 'system_phony', 'system_webdav', 'gdrive_v3', 'system_fs', 'system_coding'].forEach((e) => {
    drive_funcs[e] = require(`../router/${e}`);
});
const render_funcs = {};//渲染模块,目前建议使用w.w
['w.w', 'none',].forEach((e) => {
    render_funcs[e] = require(`../views/${e}`);
});

/**
 * onepoint ukuq
 * time:20200831
 */

class OnePoint {
    initialize(adapter) {
        this.adapter = adapter;
        this.oneCache = new OneCache();//cache管理模块
        console.log(adapter.name + '------initialize with:');
        for (let k in adapter) {
            console.log(k);
        }
        console.log('--------------');
        this.installParam = [
            { name: 'admin_username', required: true, desc: '管理员账号' },
            { name: 'admin_password', required: true, desc: '管理员密码' },
            { name: 'render_name', select: Object.keys(render_funcs), desc: '主题类型' },
            { name: 'site_name', default: 'OnePoint Demo', desc: '网站名' },
            { name: 'site_title', default: 'OnePoint Demo', desc: '网址标题' },
            { name: 'site_icon', default: 'https://cdn.onesrc.cn/uploads/images/onepoint.png', desc: '网站图标' },
            { name: 'site_keywords', desc: '关键字' },
            { name: 'site_description', desc: '网站描述' },
            { name: 'site_script', type: 'textarea', desc: '网站脚本' },
            { name: 'site_readme', type: 'textarea', desc: 'readme 网站公告' }
        ];
        this.configParam = [
            { name: 'path', required: true, desc: '挂载路径, 请保证开头结尾都是"/", 例如 /, /Drive1/, /A/B/C/' },
            { name: 'password', desc: '网站密码' },
            { name: 'desc', desc: '云盘描述' },
            { name: 'hidden', type: 'textarea', desc: '需要隐藏的子路径, 以 "," 隔开' }
        ];
        this.drivePlugins = drive_funcs;
        this.themePlugins = render_funcs;
    }

    //200710为了能够抛出错误信息, 这里改用保存成功时无返回结果,失败时抛出错误信息
    async saveConfig() {
        if (!this.config) throw Msg.error(500, Msg.constants.System_not_initialized);
        await this.adapter.writeConfig(this.config);
        await this.readConfig();
    }


    //检查密码的工具函数, 通过检查 cookie 和 post 参数验证 失败返回msg 成功返回空
    checkPass(event, name, password, hash, path) {
        let message = `${name}:${name} 需要密码`;
        if (event.cookie[name]) {//使用cookie
            if (event.cookie[name] === hash) return;
            else message = `${name}:${name} cookie 失效`;
        }

        if (event.method === 'POST') {
            //优先使用专用表项名,如果没有 尝试使用通用表项名password
            let pass = event.body[name] || event.body.password;
            if (pass === password) {//单个云盘登录
                event['set_cookie'].push({ n: name, v: hash, o: { path, maxAge: 3600 } });
                return;
            } else {//密码错误
                message = `${name}:${name} 密码错误`;
            }
        }
        return Msg.info(401, message);
    }

    async handleEvent(event) {
        if (!this.config) await this.readConfig();

        //OPTIONS method for CORS
        if (event.method === 'OPTIONS' && event.headers['access-control-request-headers']) {
            return Msg.info(204, null, {
                'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,TRACE,DELETE,HEAD,OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type,Content-Range',
                'Access-Control-Max-Age': '1728000'
            });
        }
        if (event.splitPath.p_12 === '/favicon.ico') return Msg.html(302, null, { Location: this.config.G_CONFIG.site_icon });

        if (!event.splitPath.p_12.startsWith('/admin/install/')) {
            if (this.config.installFailMsg) return Msg.html(302, this.config.installFailMsg, { Location: '/admin/install/hello-world' });
            if (Object.keys(this.config.DRIVE_MAP).length === 0) return Msg.html(302, null, { Location: '/admin/install/drive' });
        }

        if (event.start_time.getUTCDate() !== this.initTime.getUTCDate()) this.refreshCache();


        if (!['GET', 'POST', 'PUT'].includes(event.method) || event.splitPath.p_12.startsWith('/tmp/')) return Msg.info(403);

        //超管权限检查
        if (event['cookie']['ADMINTOKEN'] === this.hashes.admin_password_date_hash) event.isadmin = true;

        //关键局部变量声明
        let { p_12 } = event['splitPath'];
        let p2, responseMsg;
        let drivePath, driveInfo;
        let oneCache = this.oneCache;

        if (p_12.startsWith('/admin/')) {
            oneCache.addEventLog(event, 3);
            drivePath = '/admin/';
            driveInfo = {
                funcName: 'system_admin',
                spConfig: {
                    G_CONFIG: this.config.G_CONFIG,
                    DRIVE_MAP: this.config.DRIVE_MAP,
                    oneCache, onepoint: this
                }
            };
        } else if (p_12.startsWith('/api/')) {
            oneCache.addEventLog(event, 1);
            if (p_12 === '/api/cmd') {
                if (!event.isadmin) return Msg.info(403, "noly admin can use this api ");
                let cmdData = event.body.cmdData;
                event.cmd = event.body.cmdType;
                event.cmdData = event.body.cmdData;
                if (cmdData.path) {
                    p_12 = cmdData.path;
                    drivePath = oneCache.getDrivePath(p_12);
                    event.sp_page = cmdData.sp_page;
                } else if (cmdData.srcPath && cmdData.desPath) {
                    p_12 = cmdData.srcPath;
                    drivePath = oneCache.getDrivePath(p_12);
                    if (oneCache.getDrivePath(cmdData.desPath) !== drivePath) return Msg.info(403, cmdData.srcPath + " and " + cmdData.desPath + " is not in the same drive");
                    event.p2_des = cmdData.desPath.slice(drivePath.length - 1);
                } else return Msg.info(400, "400: cmdData is invalid");
            } else return Msg.info(400, "400: no such api");
        } else {
            oneCache.addEventLog(event, 0);
            event.cmd = event.query.download === undefined ? 'ls' : 'download';
            event.useRender = event.query.json === undefined ? true : false;
            event.sp_page = event.query.sp_page;
            drivePath = oneCache.getDrivePath(p_12);
            if (event.cmd === 'ls') {
                responseMsg = this.oneCache.getMsg(event.splitPath.p_12, event.sp_page);
                if (responseMsg) responseMsg.sp_page = (event.sp_page || responseMsg.data.nextToken) ? (event.sp_page || 0) : -1;
            }
        }

        if (!driveInfo) {
            if (!oneCache.driveCache[drivePath]) oneCache.driveCache[drivePath] = {};
            driveInfo = this.config.DRIVE_MAP[drivePath] || {
                funcName: 'system_phony', spConfig: {}
            };
        }
        p2 = p_12.slice(drivePath.length - 1);
        event.p2 = p2;
        console.log('drivePath:' + drivePath + ', p2:' + p2);


        //过滤隐藏文件夹及其子文件的请求
        //这里的过滤采用的是前缀匹配, 要求hidden中的字符串必须为 /a/b 格式, 以隐藏/a/b和/a/b/的请求;如果hidden字符为/a/b/格式,访问/a/b可绕开隐藏限制
        if (Array.isArray(driveInfo.hidden) && !event.isadmin) {
            if (driveInfo.hidden.find((e) => {
                return p2.startsWith(e);
            }) !== undefined) return Msg.info(404);
        }

        //云盘密码
        if (driveInfo.password && !event.isadmin) {
            responseMsg = this.checkPass(event, 'drive', driveInfo.password, this.hashes[drivePath], drivePath);
            if (responseMsg) return responseMsg;
        }

        if (!responseMsg) {
            responseMsg = await drive_funcs[driveInfo.funcName].func(driveInfo.spConfig, oneCache.driveCache[drivePath], event, this).catch(error => {
                if (error.type === 2) {
                    return error;
                } else if (error.response) {
                    return Msg.info(400, typeof error.response.data.pipe === 'function' ? error.message : JSON.stringify(error.response.data));
                } else {
                    console.log(error);
                    return Msg.info(400, error.message);
                }
            });
            console.log('response from drives: type=' + responseMsg.type + ' status=' + responseMsg.statusCode);
            if (responseMsg.type === 3) {
                if (responseMsg.data.html && typeof responseMsg.data.html.pipe === 'function') responseMsg.data.html.toString = () => { return '[stream object]' };
                return responseMsg;
            } else if (responseMsg.type === 1) {
                //如果不用分页则用 -1 表示, 分页则用 sp_page 标识,且 sp_page 默认值为 0
                responseMsg.sp_page = (event.sp_page || responseMsg.data.nextToken) ? (event.sp_page || 0) : -1;
            }
            if (responseMsg.statusCode < 300) this.oneCache.addMsg(p_12, responseMsg, event.cmd, event.cmdData ? event.cmdData.desPath : '');
        }

        //处理目录级密码 父文件夹中隐藏文件过滤 分页
        if (responseMsg.type === 1) {
            if (!event.isadmin) {//管理员cookie忽略密码

                //目录密码
                let pass = responseMsg.data.list.find(e => { return e.name.startsWith('.password=') });//目录级加密
                if (pass) {
                    responseMsg = this.checkPass(event, 'list', pass.slice(10), getmd5(pass), p_12);
                    if (responseMsg) return responseMsg;
                }


                //这里采用主要处理前缀匹配, 寻找该目录下的文件(夹),对于hidden字符串 /a/b/c /a/b/c/ /a/b/c/d 访问/a/b/文件夹时,  其对应的字符串为 c c/ c/d. c显然可以隐藏, c/不能, c/d 隐藏的是其下的子文件, 该项也不需要隐藏.
                //故要求,所有hidden 字符串都必须符合/a/b/c的形式, 结尾不能为/.
                if (Array.isArray(driveInfo.hidden)) {
                    let hiddens = driveInfo.hidden.map(e => { if (e.startsWith(p2)) return e.slice(p2.length) }).filter(e => { return !!e });
                    if (pass) hiddens.push(pass);
                    responseMsg.data.list = responseMsg.data.list.filter((e) => {
                        return !hiddens.includes(e.name);
                    });
                }
            }

            let pageSize = 50;//分页功能
            if (responseMsg.sp_page === -1 && responseMsg.data.list.length > pageSize) {
                let content_len = responseMsg.data.list.length;
                let page = Number(event.query['page']) || 1;
                responseMsg.data.list = responseMsg.data.list.slice((page - 1) * pageSize, page * pageSize);
                if (page > 1) responseMsg.data.prev = '?page=' + (page - 1);
                if (content_len > page * pageSize) responseMsg.data.next = '?page=' + (page + 1);
            }
        }

        //处理cookie设置的代理,代理程序参考 https://www.onesrc.cn/p/using-cloudflare-to-write-a-download-assistant.html
        if (responseMsg.type === 0) {
            if (event.cookie.proxy && !responseMsg.data.url.startsWith('?')) responseMsg.data.url = event.cookie.proxy + '?url=' + encodeURIComponent(responseMsg.data.url);
            //处理文件下载
            if (event.query.json === undefined && event.query.preview === undefined) return Msg.html(302, null, { Location: responseMsg.data.url });
        }

        return responseMsg;
    }

    /**
     * event 事件生成
     * query 可以是query字符串 也可以是对象
     */
    genEvent(method, p_12, headers, body = {}, query, cookie) {
        if (method === 'POST' && typeof body === 'string') {
            if (headers['content-type']) {
                if (headers['content-type'].includes('application/x-www-form-urlencoded')) {
                    body = querystring.parse(body);
                } else if (headers['content-type'].includes('application/json')) {
                    body = JSON.parse(body);
                }
            }
        } else if (method === 'PUT' && typeof body.pipe === 'function') body.toJSON = () => { return '[stream object]' };
        if (!query) query = {};
        else if (typeof query === 'string') query = querystring.parse(query);
        if (!cookie) cookie = _cookie.parse(headers.cookie || '');
        let ph = headers['x-op-ph'] || ('//' + headers.host);
        let p0 = headers['x-op-p0'] || '';

        let event = {
            method, headers, body, query, cookie,
            splitPath: {
                ph, p0, p_12: decodeURIComponent(p_12)
            },
            start_time: new Date(),
            set_cookie: []
        }
        console.log('start_time:' + event.start_time.toLocaleString() + ` ${method} ${event.splitPath.p_12}`);
        return event;
    }

    //尝试读取配置文件 读取失败, 则用 config.installFailMsg 存放失败消息, 同时使用系统默认配置, 以保证系统能正常运行
    async readConfig() {
        this.config = await this.adapter.readConfig().catch(err => {
            return { installFailMsg: err.message };
        });

        let config = this.config;
        config.G_CONFIG = config.G_CONFIG || {};
        config.DRIVE_MAP = config.DRIVE_MAP || {};

        let G_CONFIG = config['G_CONFIG'];
        let DRIVE_MAP = config['DRIVE_MAP'];

        G_CONFIG.admin_username = G_CONFIG.admin_username || 'admin';
        G_CONFIG.admin_password = G_CONFIG.admin_password || 'admin';
        G_CONFIG.render_name = G_CONFIG.render_name || 'w.w';
        G_CONFIG.site_icon = G_CONFIG.site_icon || 'https://cdn.onesrc.cn/uploads/images/onepoint.png';
        G_CONFIG.proxy = G_CONFIG.proxy || [];
        G_CONFIG.access_origins = G_CONFIG.access_origins || [];

        // console.log(DRIVE_MAP);
        this.refreshCache();
        console.log("initialize success");
        for (let k in DRIVE_MAP) {
            //这里可以做一下配置修正
            if (Array.isArray(DRIVE_MAP[k].hidden)) {

            }
            if (!k.startsWith('/') || !k.endsWith('/')) {
                DRIVE_MAP[(k.startsWith('/') ? "" : "/") + k + (k.endsWith('/') ? "" : "/")] = DRIVE_MAP[k];
                delete DRIVE_MAP[k];
            }
        }
    }

    refreshCache() {
        //设置管理员密码 hash 值
        let time = new Date();
        let G_CONFIG = this.config['G_CONFIG'];
        let DRIVE_MAP = this.config['DRIVE_MAP'];
        this.initTime = time;
        this.hashes = {};
        this.hashes.admin_password_date_hash = getmd5(G_CONFIG.admin_password + time.getUTCMonth() + time.getUTCDate() + G_CONFIG.admin_username);
        this.oneCache.initDrives(Object.keys(DRIVE_MAP));
        for (let k in DRIVE_MAP) {
            if (DRIVE_MAP[k].password) this.hashes[k] = getmd5(DRIVE_MAP[k].password + time.getUTCMonth() + time.getUTCDate());
            this.oneCache.driveCache[k] = {};
        }
        console.log('cache is cleared');
    }
}
var onepoint = new OnePoint();
//封装一层,避免私有量被访问
exports.op = {
    initialize(adapter) {
        onepoint.initialize(adapter);
    },
    async handleRaw(method, p_12, headers, body, query, cookie) {

        let event = onepoint.genEvent(method, p_12, headers, body, query, cookie);

        const command_reg = /^\/(?<num>\d+):(?<command>[a-zA-Z0-9]*)(\/.*)?$/g;
        const match = command_reg.exec(event.splitPath.p_12);
        if (match) {
            event.splitPath.p_12 = match[3] || '/';
            if (match.groups.command === 'view') {
                event.splitPath.p0 = `${event.splitPath.p0}/${match.groups.num}:`;
                event.splitPath.p_12 = event.query.url ? event.query.url.slice(event.splitPath.ph.length + event.splitPath.p0.length) : '/';
            } else {
                if (['down', 'id2path'].includes(match.groups.command)) event.splitPath.p0 = `${event.splitPath.p0}/${match.groups.num}:`;
                else event.splitPath.p0 = `${event.splitPath.p0}/${match.groups.num}:${match.groups.command}`;
                if (event.body.page_token) {
                    Object.assign(event.query, querystring.parse(event.body.page_token.slice(1)));
                }
            }
            event['x-theme-acrou-flag'] = match.groups.command || 'list';
        }

        let msg = await onepoint.handleEvent(event);

        //处理api部分
        if (!event.useRender && msg.type !== 3) msg = Msg.html_json(msg.statusCode, msg.data, msg.headers);

        let b;
        if (msg.type === 3) b = msg.data.html || '';
        else {
            if (msg.data.nextToken) msg.data.next = '?sp_page=' + msg.data.nextToken;
            b = render_funcs[onepoint.config.G_CONFIG.render_name].render(msg, event, onepoint.config.G_CONFIG);
        }

        let h = Object.assign({ 'Content-Type': 'text/html' }, msg.headers);
        let o = headers.origin;
        if (o && (onepoint.config.installFailMsg || onepoint.config.G_CONFIG.access_origins.includes(o))) {
            h['Access-Control-Allow-Origin'] = o;
            h['Access-Control-Allow-Credentials'] = true;
            event['set_cookie'].forEach((e => {
                if (!e.o) return;
                e.o.sameSite = "none";
                e.o.secure = true;
            }));
        }

        if (h.Location) {
            if (h.Location.startsWith('/')) h.Location = event.splitPath.ph + event.splitPath.p0 + h.Location;//相对路径
            if (h.Location.startsWith('?')) h.Location = event.splitPath.ph + event.splitPath.p0 + encodeURI(event.splitPath.p_12) + h.Location;//search参数
        }
        h['Set-Cookie'] = event['set_cookie'].map((e => {
            if (e.o.path.startsWith('/')) e.o.path = event.splitPath.p0 + encodeURI(e.o.path);
            return _cookie.serialize(e.n, e.v, e.o);
        }));

        console.log('end_time:' + new Date().toLocaleString());
        return {
            'statusCode': msg.statusCode,
            'headers': h,
            'body': b
        }
    }
};


function getSimpleWebdavXml(list, ppath) {
    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="no"?><d:multistatus xmlns:d="DAV:">';
    ppath = ppath.replace(/&/g, '&amp;');
    list.forEach(e => {
        if (e.type == 0) {
            xml += `<d:response>
            <d:href>${ppath}${e.name.replace(/&/g, '&amp;')}</d:href>
            <d:propstat>
                <d:prop>
                    <d:getlastmodified>${new Date(e.time).toGMTString()}</d:getlastmodified>
                    <d:getcontentlength>${e.size}</d:getcontentlength>
                    <d:getcontenttype>${e.mime}</d:getcontenttype>
                    <d:resourcetype/>
                </d:prop>
            </d:propstat>
        </d:response>`
        } else {
            xml += `<d:response>
            <d:href>${ppath}${e.name.replace(/&/g, '&amp;')}/</d:href>
            <d:propstat>
                <d:prop>
                    <d:getlastmodified>${new Date(e.time).toGMTString()}</d:getlastmodified>
                    <d:getcontentlength>${e.size || 0}</d:getcontentlength>
                    <d:getcontenttype>httpd/unix-directory</d:getcontenttype>
                    <d:resourcetype>
                        <d:collection/>
                    </d:resourcetype>
                </d:prop>
            </d:propstat>
            </d:response>`
        }
    });
    xml += '</d:multistatus>';
    return xml;
}

function getSimpleWebdavInfo(info) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?><d:error xmlns:d="DAV:" xmlns:s="https://ukuq.github.io"><s:message>${info}</s:message></d:error>`;
}