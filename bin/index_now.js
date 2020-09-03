const fs = require('fs');
const path = require('path');
const { op } = require('onepoint');
const axios = require("axios");

op.initialize({
    name: "now.sh",
    readConfig,
    writeConfig,
    firstInstall,
    installParam: [{
        name: 'x-nowsh-token',
        desc: '获取 token: https://vercel.com/account/tokens',
        required: true
    }]
});//支持保存功能

module.exports = async (req, res) => {
    try {
        let r = await op.handleRaw(req.method, req.url, req.headers, req.body, req.headers['x-real-ip'], '', req.query, req.cookies);
        res.writeHead(r.statusCode, r.headers);
        res.write(r.body);
        res.end();
    } catch (error) {
        console.log(error);
        res.writeHead(500, {});
        res.write("error");
        res.end();
    }
};

async function readConfig() {
    // 部署now时, 配置文件和本文件为同目录
    let config = JSON.parse(fs.readFileSync(path.resolve(__dirname, './config.json'), 'utf8'));
    if (!config.G_CONFIG['x-nowsh-token']) throw new Error("configuration is invalid: x-nowsh-token");
    return config;
}

async function writeConfig(config) {
    let nowConfig = {
        "name": "onepoint",
        "files": [
            { "file": "api/index_now.js", "data": "" },
            { "file": "api/package.json", "data": "" },
            { "file": "api/config.json", "data": "" }
        ],
        "functions": {
            "api/index_now.js": { "maxDuration": 10 }
        },
        "routes": [{ "src": "/.*", "dest": "api/index_now.js" }],
        "projectSettings": { "framework": null }
    };
    nowConfig.files.forEach(e => {
        if (e.file === 'api/config.json') e.data = JSON.stringify(config);
        else e.data = fs.readFileSync(path.resolve(__dirname, e.file.slice(4)), 'utf8');
    })
    await axios.default.post("https://api.vercel.com/v12/now/deployments", nowConfig, { headers: { Authorization: `Bearer ${token}` } });
    //old api: await axios.default.post("https://point.onesrc.cn/github/nowsh-deploy", { token: config.G_CONFIG['x-nowsh-token'], config_json: JSON.stringify(config, null, 2) });
}

async function firstInstall(config) {
    if (!config.G_CONFIG['x-nowsh-token']) throw new Error("configuration parameter missing: x-nowsh-token");
    await writeConfig(config);
    return 'install success';
}