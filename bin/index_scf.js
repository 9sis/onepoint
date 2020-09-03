const process = require('process');
process.env['TENCENTCLOUD_SECRETID']
process.env['TENCENTCLOUD_SECRETKEY']
process.env['TENCENTCLOUD_SESSIONTOKEN']
const { op } = require('./main');

op.initialize({
    name: "scf",
    readConfig,
    writeConfig,
    firstInstall,
    installParam: [{
        name: 'nothing',
        required: true,
        desc: '测试用, 配置只会存到缓存中, 并不会写入系统. 每次scf重启后显示此页面'
    }]
});

//@usage 如果需要使用保存功能,需要借用腾讯的cos,地区建议和云函数所在地区一致,内网之间流量免费
var COS = require('cos-nodejs-sdk-v5');

const cosConfig = {
    SecretId: '',
    SecretKey: '',
    Bucket: '',
    Region: '',
    Key: ''
}

let _config;

var cos = new COS({
    SecretId: cosConfig.SecretId,
    SecretKey: cosConfig.SecretKey
});

exports.main_handler = async (event, context, callback) => {
    event.headers['x-real-ip'] = event['requestContext']['sourceIp'];

    let p_12 = event.path;
    //处理域名和路径,分离得到 p0 p12
    let requestContext_path = event['requestContext']['path'];
    if (requestContext_path.endsWith('/')) requestContext_path = requestContext_path.slice(0, -1);// / or /abc/
    if (event['headers']['host'].startsWith(event['requestContext']['serviceId'])) {//长域名
        event.headers['x-op-p0'] = `/${event['requestContext']['stage']}${requestContext_path}`;
        p_12 = p_12.slice(requestContext_path.length) || '/';//  只有scf网关不规范 ,例如 /abc 前者才为
    }
    return await op.handleRaw(event.httpMethod, p_12, event.headers, event.body, event.queryString);
}

async function readConfig() {
    if (_config) throw new Error('未配置');
    return _config;
    return new Promise((resolve, reject) => {
        cos.getObject({
            Bucket: cosConfig.Bucket,
            Region: cosConfig.Region,
            Key: cosConfig.Key,
        }, function (err, data) {
            if (err) reject(err);
            else resolve(JSON.parse(String(data.Body)));
        });
    });
}

async function writeConfig(config) {
    _config = config;
    return;
    return new Promise((resolve, reject) => {
        cos.putObject({
            Bucket: cosConfig.Bucket,
            Region: cosConfig.Region,
            Key: cosConfig.Key,
            Body: JSON.stringify(config),
        }, function (err) {
            if (err) reject(err);
            else resolve();
        });
    });
}

async function firstInstall(config) {
    await writeConfig(config);
    return '配置写入成功 下次scf重启需要重新配置';
}