const { Msg } = require('../utils/msgutils');
const { getmd5, fs, path } = require('../utils/nodeutils');
let G_CONFIG, DRIVE_MAP, oneCache, onepoint;
let _event;
const ajax_funcs = [];

//@flag 比较凌乱,以后再修改
exports.func = async (spConfig, cache, event) => {
    let p2 = event.p2;
    if (p2 == '/') return Msg.html(200, vue_html);
    G_CONFIG = spConfig['G_CONFIG'];
    DRIVE_MAP = spConfig['DRIVE_MAP'];
    oneCache = spConfig['oneCache'];
    onepoint = spConfig['onepoint'];
    _event = event;
    event.noRender = true;

    if (onepoint.config.installFailMsg && p2 === '/install/hello-world') {
        if (event.method === 'GET') return Msg.html(200, installHtml(onepoint.config.installFailMsg + '\n请先配置安装信息', '', onepoint.installParam.concat(onepoint.adapter.installParam)));
        let successMsg, failedMsg;
        successMsg = await onepoint.adapter.firstInstall({ G_CONFIG: event.body }).catch((err) => { failedMsg = err.message });
        if (failedMsg) return Msg.info(400, 'install failed: ' + failedMsg);
        await onepoint.readConfig();
        event.set_cookie.push({ n: 'ADMINTOKEN', v: onepoint.hashes.admin_password_date_hash, o: { path: '/' } });
        return Msg.info(200, onepoint.config.installFailMsg ? 'read failed ' + onepoint.config.installFailMsg : (successMsg || 'install success'));
    }

    if (p2.startsWith("/public/")) {
        switch (p2.slice(7)) {
            case '/site':
                return Msg.html_json(200, { site_name: G_CONFIG.site_name, site_readme: G_CONFIG.site_readme, proxy_cookie: event.cookie.proxy, proxy: G_CONFIG.proxy, version: require('../package.json').version });
            case '/proxy':
                event['set_cookie'].push({ n: 'proxy', v: event.query.proxy || "", o: { path: event.splitPath.p0 + '/' } });
                return Msg.html(200, "proxy via: " + event.query.proxy);
            case '/event':
                return Msg.html_json(200, event);
            case '/login':
                //@flag 考虑以后加上验证码
                if (event.isadmin || event['method'] === 'POST' && event['body']['password'] === G_CONFIG.admin_password && event['body']['username'] === G_CONFIG.admin_username) {
                    event['set_cookie'].push({ n: 'ADMINTOKEN', v: onepoint.hashes.admin_password_date_hash, o: { path: event.splitPath.p0 + '/' } });
                    return Msg.info(200, "success");
                }
                else return Msg.info(403, "账号或密码错误");
            case '/logout':
                event['set_cookie'].push({ n: 'ADMINTOKEN', v: 0, o: { path: event.splitPath.p0 + '/' } });
                return Msg.html(204, "logout");
            case '/search':
                return;
            default:
                break;
        }
    }

   // if (!event.isadmin) return Msg.html(401, 'only admin can use this api');

    if (p2.startsWith('/install/drive')) {
        let match = /install\/drive\/(\w+)/.exec(p2);
        if (match && match[1]) {
            if (!onepoint.drivePlugins[match[1]]) return Msg.info(400, 'invalid drive type ' + match[1]);
            if (event.method === 'GET') return Msg.html(200, installHtml('请填写相关信息, 当前已挂载: ' + JSON.stringify(Object.keys(onepoint.config.DRIVE_MAP)), '', onepoint.configParam.concat(onepoint.drivePlugins[match[1]].configParam)));
            onepoint.config.DRIVE_MAP[event.body.path] = {
                funcName: match[1],
                spConfig: event.body,
                desc: event.body.desc,
                password: event.password,
                hidden: event.body.hidden.split(',').filter(e => { return e.trim() })
            };
            delete event.body.path;
            delete event.body.desc;
            delete event.body.password;
            delete event.body.hidden;
            await onepoint.saveConfig();
            return Msg.info(200, 'add drive success');
        }
        if (event.method === 'GET') return Msg.html(200, installHtml('请继续添加云盘, 当前云盘数量: ' + Object.keys(onepoint.config.DRIVE_MAP).length, '', [{ name: 'drive_type', required: true, select: Object.keys(onepoint.drivePlugins) }]));
        return Msg.info(302, null, { Location: '/admin/install/drive/' + event.body.drive_type });
    }
    
    if (!event.isadmin) return Msg.html(401, 'only admin can use this api');

    if (t = /\/ajax\/([^/]+)(.*)/.exec(p2)) {
        return await ajax_funcs[t[1]](t[2]);
    }
    if (p2 !== '/') return Msg.html(302, null, { Location: '/admin/' });
    return Msg.html(200, vue_html, { 'Content-Type': 'text/html' });
}

ajax_funcs['dashboard'] = () => {
    let drivesInfos = [];
    for (let i in DRIVE_MAP) {
        drivesInfos.push({
            path: i,
            funcName: DRIVE_MAP[i]['funcName'],
            password: DRIVE_MAP[i]['password'] ? '***' : ''
        });
    }
    return Msg.html_json(200, {
        runInfo: {
            createTime: oneCache.createTime,
            initTime: oneCache.initTime,
            normal: oneCache.eventlog[0].length,
            api: oneCache.eventlog[1].length,
            admin: oneCache.eventlog[3].length
        },
        drivesInfos: drivesInfos
    });
}

//@flag 此处需要隐去密码相关信息
ajax_funcs['setting'] = (p) => {
    let config = onepoint.config;
    if (p === '/site') {
        let g_config = config.G_CONFIG;
        let r = {};
        for (let k in g_config) {
            if (k.startsWith('site_')) {
                r[k] = g_config[k];
            }
        }
        return Msg.html_json(200, { G_CONFIG: r });
    } else if (p === '/drives') {
        let drive_map = config.DRIVE_MAP;
        let r = [];
        for (let k in drive_map) {
            let drive = {};
            drive.path = k;
            drive.funcName = drive_map[k].funcName;
            drive.password = drive_map[k].password;
            drive.spConfig = Object.assign({}, drive_map[k].spConfig);
            if (drive_map[k].funcName === 'onedrive_graph') {
                drive.spConfig.refresh_token = drive.spConfig.refresh_token.slice(0, 30) + "...There's always something I could not tell you!";
            }
            r.push(drive);
        }
        return Msg.html_json(200, { DRIVE_MAP: r });
    }
    if (_event.body.password !== onepoint.config.G_CONFIG.admin_password) return Msg.info(403, '管理员密码错误');
    return Msg.html_json(200, onepoint.config);
}

ajax_funcs['cache'] = () => {
    //return Msg.html_json(200, cache);
    return Msg.html_json(200, oneCache.search());
}

ajax_funcs['event'] = () => {
    return Msg.html_json(200, _event);
}

ajax_funcs['logs'] = () => {
    return Msg.html_json(200, oneCache.eventlog[Number(_event.query.type) || 0]);
}

ajax_funcs['share'] = () => {
    let url = `${_event.query.path}?token=${getmd5(DRIVE_MAP[_event.query.path].password + _event.query.time)}&expiresdate=${_event.query.time}`;
    return Msg.html_json(200, { url });
}

ajax_funcs['save'] = async () => {
    let config = onepoint.config;
    let newConfig = _event.body;

    if (newConfig.G_CONFIG) {
        if (newConfig.G_CONFIG.admin_password || newConfig.G_CONFIG.admin_username) {
            if (newConfig.G_CONFIG.admin_password_old !== config.G_CONFIG.admin_password) {
                return Msg.info(403, '密码错误,保存失败');
            } else {
                delete newConfig.G_CONFIG.admin_password_old;
            }
        }
        config.G_CONFIG = Object.assign(config.G_CONFIG, newConfig.G_CONFIG);
    }
    //@flag 这里先这样设置
    if (newConfig.DRIVE_MAP) {
        for (let k in config.DRIVE_MAP) {
            if (newConfig.DRIVE_MAP[k]) {
                if (!newConfig.DRIVE_MAP[k].isNew) newConfig.DRIVE_MAP[k] = config.DRIVE_MAP[k];
                else delete newConfig.DRIVE_MAP[k].isNew;
            }
        }
        config.DRIVE_MAP = newConfig.DRIVE_MAP;
    }
    await onepoint.saveConfig();
    return Msg.info(200, 'success');
}

const vue_html = fs.readFileSync(path.resolve(__dirname, '../views/admin/index.html')).toString();

function installHtml(header, action, arr) {
    var f = (arr) => {
        let html = "";
        for (let o of arr) {

            html += `<div class="zi-card"><h4>${o.name}</h4><p class="zi-subtitle">${o.desc}</p>`
            if (o.select) {
                html += `<div class="zi-select-container small"><select  class="zi-select" name=${o.name}>`
                for (let pa of o.select) {
                    html += `<option>${pa}</option>`
                }
                html += `</select><i class="arrow zi-icon-up"></i></div>`
            } else if (o.type == 'textarea') {
                html += `<textarea class="zi-input" name=${o.name} ${o.default ? 'value=' + o.default : ''}></textarea>`
            } else {
                html += `<input class="zi-input" name=${o.name} ${o.default ? 'value=' + o.default : ''}>`
            }
            html += `</div>`
        }
        return html;
    }
    let html = `<head><meta charset="utf-8"><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@geist-ui/style@latest/dist/style.css" /><style>.zi-card {margin: 1rem 0;}.zi-input{width:60%;}textarea.zi-input{height:6rem;}.zi-card>h4 {margin-bottom: 0;}.zi-rate-star.zi-icon-star {padding: 0 0.2rem;}</style></head><body class="zi-main zi-layout"><p class="zi-note">${header}</p><form method="post" action="${action}">`
    let arr_required = [];
    let arr_not_required = [];
    arr.forEach(e => { if (e.required) arr_required.push(e); else arr_not_required.push(e); });
    html += f(arr_required);
    if (arr_not_required.length > 0) {
        html += `<div class="zi-more"><button class="zi-btn circular small auto" id="show-more">Show More<i class="suffix zi-icon-up"></i></button></div><div id="not-required" style="display:none">`;
        html += f(arr_not_required);
        html += `</div>`;
    }

    html += `<div class="zi-rate" style="text-align: center;"><i class="zi-rate-star zi-icon-star active"></i><i class="zi-rate-star zi-icon-star"></i><i class="zi-rate-star zi-icon-star active"></i><i class="zi-rate-star zi-icon-star"></i><i class="zi-rate-star zi-icon-star active"></i><input class="zi-btn small" type="submit"><i class="zi-rate-star zi-icon-star"></i><i class="zi-rate-star zi-icon-star active"></i><i class="zi-rate-star zi-icon-star"></i><i class="zi-rate-star zi-icon-star active"></i><i class="zi-rate-star zi-icon-star"></i></div></form><script>document.getElementById('show-more').onclick=function(event){let flag = !!document.getElementById('not-required').style.display;document.getElementById('not-required').style.display=flag?'':'none';document.getElementById('show-more').innerHTML=flag?'Show Less<i class="suffix zi-icon-down"></i>':'Show More<i class="suffix zi-icon-up"></i>';return false;};</script></body>`
    return html;
}