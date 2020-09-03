const http = require('http');
const fs = require('fs');
const path = require('path');
const { op } = require('./main');
const process = require('process');
const _url = require('url');
let port = process.env.PORT || 8020;
let server;
let config_file_path;

const CONFIG_FILE_PATHS = [
    path.resolve('/', 'etc/onepoint_config.json'),
    path.resolve(__dirname, '../../config.json'),
    path.resolve(__dirname, '../config2.json')
];

op.initialize({
    name: "node",
    readConfig,
    writeConfig,
    firstInstall,
    installParam: [{
        name: 'x-node-config-path',
        select: CONFIG_FILE_PATHS,
        desc: '配置文件存放的位置',
        required: true
    }]
});

module.exports = () => {
    if (server) server.close();
    server = http.createServer((req, res) => {
        if (req.method !== 'PUT') {
            let body = "";
            req.on('data', (chunk) => {
                body += chunk;
            });
            req.on('end', async () => {
                handleReq(body);
            });
        } else {
            handleReq(req);
        }
        async function handleReq(body) {
            try {
                req.headers['x-real-ip'] = req.headers['x-real-ip'] || req.connection.remoteAddress;
                let r = await op.handleRaw(req.method, _url.parse(req.url).pathname, req.headers, body, _url.parse(req.url).query);
                res.writeHead(r.statusCode, r.headers);
                if (typeof r.body.pipe === 'function') r.body.pipe(res);
                else res.end(r.body);
            } catch (error) {
                console.log(error);
                res.writeHead(500, {});
                res.write("error");
                res.end();
            }
        }
    }).listen(port);
    console.log('OnePoint is running at http://localhost:' + port);
}
module.exports();

async function readConfig() {
    for (let path of CONFIG_FILE_PATHS) {
        if (fs.existsSync(path)) {
            config_file_path = path;
            console.log('read config from:' + config_file_path);
            return JSON.parse(fs.readFileSync(path, 'utf8'));
        }
    }
    throw new Error("CONFIG_FILE_PATHS is invalid");
}

async function writeConfig(config) {
    return new Promise((resolve, reject) => {
        fs.writeFile(config_file_path, JSON.stringify(config, null, 2), (err) => {
            if (err) reject(err);
            else resolve();
        })
    });
}

async function firstInstall(config) {
    config_file_path = config.G_CONFIG['x-node-config-path'];
    if (!CONFIG_FILE_PATHS.includes(config_file_path)) throw new Error("config_file_path is invalid: " + config_file_path);
    for (let path of CONFIG_FILE_PATHS) {
        if (fs.existsSync(path)) fs.unlinkSync(path);
        if (config_file_path === path) break;
    }
    await writeConfig(config);
    return 'install success';
}