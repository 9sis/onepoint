exports.render = (responseMsg, event, G_CONFIG) => {

    if (event.method === 'POST') {
        if (event['x-theme-acrou-flag'] === 'id2path') {
            return event.body.id ? Buffer.from(event.body.id, 'base64').toString() : '/';
        }
        if (responseMsg.statusCode === 401) {
            responseMsg.statusCode = 200;
            return JSON.stringify({ "error": { "code": 401, "message": responseMsg.data.info } });
        }
        if (responseMsg.type === 1) {
            return JSON.stringify({
                "nextPageToken": responseMsg.data.next || null,
                "curPageIndex": 0,
                "data": {
                    "files": responseMsg.data.list.map(e => {
                        return {
                            "id": Buffer.from(event.splitPath.p_12 + e.name + (e.type === 1 ? '/' : '')).toString('base64'),
                            "name": e.name,
                            "mimeType": e.mime || 'application/vnd.google-apps.folder',
                            "modifiedTime": e.time,
                            "size": e.size,
                            "thumbnailLink": e.mime.startsWith('image') ? event.splitPath.ph + event.splitPath.p0 + event.splitPath.p_12 + e.name : undefined
                        }
                    })
                }
            });
        } else return JSON.stringify(responseMsg.data);
    }
    if (event.method === 'GET') {
        if (!event['x-theme-acrou-flag']) {
            responseMsg.statusCode = 302;
            responseMsg.headers = responseMsg.headers || {};
            responseMsg.headers.Location = '/0:/'
            return '';
        } else if (['view', 'down'].includes(event['x-theme-acrou-flag'])) {
            if (responseMsg.statusCode === 401) {
                responseMsg.statusCode = 301;
                responseMsg.headers = responseMsg.headers || {};
                responseMsg.headers.Location = event.splitPath.p_12;//通过改变p0实现重定向 用于解决cookie问题
                return '';
            } else {
                return JSON.stringify(responseMsg.data);
            }
        } else if (event['x-theme-acrou-flag'] === 'list' && !event.splitPath.p_12.endsWith('/')) {
            return JSON.stringify(responseMsg.data);
        }
    }
    responseMsg.statusCode = 200;
    return `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0,maximum-scale=1.0, user-scalable=no"/>
      <title>Achirou's Cloud</title>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@5.14.0/css/all.min.css">
      <style>
        @import url(https://cdn.jsdelivr.net/gh/Aicirou/goindex-theme-acrou@2.0.8/dist/style.min.css);
      </style>
      <style type="text/css">
        .donate {
            position: relative
        }
        .donate .qrcode {
            display: none;
            position: absolute;
            z-index: 99;
            bottom: 2.5em;
            line-height: 0;
            overflow: hidden;
            border-radius: 4px;
            box-shadow: 0 4px 10px rgba(0,0,0,.1),0 0 1px rgba(0,0,0,.2);
            overflow: hidden;
        }
        .donate .qrcode img {
            max-width: 280px
        }
        .donate:hover .qrcode {
            display: block
        }
        .donate:first-child:not(:last-child) .qrcode {
            left: -.75rem
        }
        .donate:last-child:not(:first-child) .qrcode {
            right: -.75rem
        }
        .plyr__caption {
          background: none !important;
          text-shadow: black 0.1em 0.1em 0.2em !important;
        }
      </style>
      <script>      
        window.gdconfig = JSON.parse('{"version":"1.1.2","themeOptions":{"cdn":"https://cdn.jsdelivr.net/gh/Aicirou/goindex-theme-acrou","version":"2.0.8","languages":"en","render":{"head_md":true,"readme_md":true,"desc":true},"video":{"api":"","autoplay":true},"audio":{}}}');
        window.themeOptions = window.gdconfig.themeOptions;
        window.gds = JSON.parse('["onepoint"]');
        window.MODEL = JSON.parse('{"root_type":1}');
        window.current_drive_order = 0;
      </script>
    </head>
    <body>
        <div id="app"></div>
        <script src="https://cdn.jsdelivr.net/gh/Aicirou/goindex-theme-acrou@2.0.8/dist/app.min.js"></script>
    </body>
    </html>`
    let splitPath = event.splitPath;
    let p_h0 = splitPath.ph + splitPath.p0;
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><link rel="shortcut icon" href="${G_CONFIG.site_icon}"><title>${G_CONFIG.site_title}</title></head><body>请访问<a href="${p_h0}/admin/">admin目录</a>获取数据</body></html>`;
};