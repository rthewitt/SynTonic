var WebSocketServer = require('ws').Server,
    express = require('express'),
    http = require('http'),
    net = require('net'),
    app = express();

app.use('/', express.static(__dirname + '/static/app'));

var port = 8888;
var routes = {};

routes.main = function(req, res) {
    res.sendFile('/index.html', { root: './static/app' });
};

var server = http.createServer(app);
server.listen(port);

var wss = new WebSocketServer({ server: server });

wss.on('connection', function(ws) {

    console.log('websocket connected, totally unnecessary');

    //ws.send(data);

    // no longer using websocket for MIDI passthrough
    // ws.onmessage = function(data) { };

    ws.on('close', function() {
        console.log('websocket closed');
    });
});

exports = module.exports = app;
