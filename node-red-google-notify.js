'use strict';
var mediaServers = [];
const serverIP = require("ip").address();
const defaultServerPort = "8098";
const defaultCacheFolder = "/tmp"

module.exports = function (RED) {

  // Configuration node
  function GoogleNotifyConfig(nodeServer) {
    RED.nodes.createNode(this, nodeServer);
    //Prepare language Select Box
    var obj = require('./languages');
    //map to Array:
    var languages = [];
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        languages.push({
          key: key,
          value: obj[key]
        });
      }
    };

    //Build an API for config node HTML to use
    RED.httpAdmin.get('/languages', function (req, res) {
      res.json(languages || []);
    });

    RED.httpAdmin.get('/gn-contentTypes', function (req, res) {
      res.json({
        youtube: 'youtube/video',
        // official supported https://developers.google.com/cast/docs/media
        aac: 'video/mp4',
        mp3: 'audio/mp3',
        m4a: 'audio/mp4',
        mpa: 'audio/mpeg',
        mp4: 'audio/mp4',
        webm: 'video/webm',
        vp8: 'video/webm',
        wav: 'audio/vnd.wav',
        bmp: 'image/bmp',
        gif: 'image/gif',
        jpeg: 'image/jpeg',
        jpg: 'image/jpeg ',
        jpe: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        // additional other formats
        au: 'audio/basic',
        snd: 'audio/basic',
        mp2: 'audio/x-mpeg',
        mid: 'audio/mid',
        midi: 'audio/mid',
        rmi: 'audio/mid',
        aif: 'audio/x-aiff',
        aiff: 'audio/x-aiff',
        aifc: 'audio/x-aiff',
        mov: 'video/quicktime',
        qt: 'video/quicktime',
        flv: 'video/x-flv',
        mpeg: 'video/mpeg',
        mpg: 'video/mpeg',
        mpe: 'video/mpeg',
        mjpg: 'video/x-motion-jpeg',
        mjpeg: 'video/x-motion-jpeg',
        '3gp': 'video/3gpp',
        avi: 'video/x-msvideo',
        wmv: 'video/x-ms-wmv',
        movie: 'video/x-sgi-movie',
        m3u: 'audio/x-mpegurl',
        ogg: 'audio/ogg',
        ogv: 'audio/ogg',
        ra: 'audio/vnd.rn-realaudio', // audio/x-pn-realaudio'
        stream: 'audio/x-qt-stream',
        rpm: 'audio/x-pn-realaudio-plugin',
        ram: 'audio/x-pn-realaudio',
        m3u8: 'application/x-mpegURL',
        svg: 'image/svg',
        tiff: 'image/tiff',
        tif: 'image/tiff',
        ico: 'image/x-icon'
      });
    });

    //Known issue: when 'language' is Default/Auto, this will fail & return undefined
    this.mediaServerPortInUse = (nodeServer.mediaServerPort ? nodeServer.mediaServerPort : defaultServerPort);
    this.cacheFolderInUse = (nodeServer.cacheFolder ? nodeServer.cacheFolder : defaultCacheFolder);
    this.mediaServerUrl = (nodeServer.mediaServerUrl ? nodeServer.mediaServerUrl : 'http://' + serverIP);

    mediaServerStart(this);

    this.googlehomenotifier = require('google-notify')(
      nodeServer.ipaddress,
      nodeServer.language,
      nodeServer.speakSlow,
      this.mediaServerUrl,
      this.mediaServerPortInUse,
      this.cacheFolderInUse,
      nodeServer.playVolumeLevel
    );

    // this.googlehomenotifier.setMaxListeners(Infinity);


    //Build another API to auto detect IP Addresses
    discoverIpAddresses('googlecast', function (ipaddresses) {
      RED.httpAdmin.get('/gn-ipaddresses', function (req, res) {
        res.json(ipaddresses);
      });
    });
  };

  RED.nodes.registerType("google-notify-config", GoogleNotifyConfig);

  //--------------------------------------------------------

  function GoogleNotify(nodeInFlow) {
    RED.nodes.createNode(this, nodeInFlow);
    this.nodeInFlow = nodeInFlow;
    if (this.nodeInFlow.language == 'config') this.nodeInFlow.language = undefined;
    if (this.nodeInFlow.playVolumeLevel == '') this.nodeInFlow.playVolumeLevel = undefined;
    if (this.nodeInFlow.speakSlow == 'config') this.nodeInFlow.speakSlow = undefined;
    if (this.nodeInFlow.playMessage == '') this.nodeInFlow.playMessage = undefined;

    const thisNode = this;
    const thisNodeServerInstance = RED.nodes.getNode(nodeInFlow.server);

    if (thisNodeServerInstance === null || thisNodeServerInstance === undefined) {
      node_status_error("please assign node to a cast device")
      return;
    }

    thisNode.node_status = function (message) {
      thisNode.status({
        fill: "blue",
        shape: "dot",
        text: message
      });
    };

    thisNode.node_status_ready = function() {
      thisNode.status({
        fill: "green",
        shape: "dot",
        text: "ready"
      });
    }

    thisNode.on('input', function (msg) {
      msg.speakSlow = (msg.hasOwnProperty('speakSlow') ? msg.speakSlow : this.nodeInFlow.speakSlow);
      if (msg.speakSlow != undefined && typeof (msg.speakSlow) != 'boolean') {
        msg.speakSlow = msg.speakSlow.toLowerCase() == 'true' ? true : false;
      }
      msg.playVolumeLevel = (msg.hasOwnProperty('playVolumeLevel') ? msg.playVolumeLevel : this.nodeInFlow.playVolumeLevel);
      msg.playMessage = (msg.hasOwnProperty('playMessage') ? msg.playMessage : this.nodeInFlow.playMessage);
      msg.language = (msg.hasOwnProperty('language') ? msg.language : this.nodeInFlow.language);
      msg.mediaUrl = (msg.hasOwnProperty('mediaUrl') ? msg.mediaUrl : this.nodeInFlow.mediaUrl);
      msg.mediaType = (msg.hasOwnProperty('mediaType') ? msg.mediaType : this.nodeInFlow.mediaType);
      msg.mediaServerUrl = (msg.hasOwnProperty('mediaServerUrl') ? msg.mediaServerUrl : this.nodeInFlow.mediaServerUrl);
      msg.mediaServerPort = (msg.hasOwnProperty('mediaServerPort') ? msg.mediaServerPort : this.nodeInFlow.mediaServerPort);
      msg.cacheFolder = (msg.hasOwnProperty('cacheFolder') ? msg.cacheFolder : this.nodeInFlow.cacheFolder);
      //Validate config node
      if (thisNodeServerInstance === null || thisNodeServerInstance === undefined) {
        thisNode.status({
          fill: "red",
          shape: "ring",
          text: "please create & select a config node"
        });
        return;
      }

      //Workaround for a known issue
      if (thisNodeServerInstance.googlehomenotifier === null || thisNodeServerInstance.googlehomenotifier === undefined) {
        node_status_error("please select a non-Default language")
        return;
      }

      console.log("new message -----");
      msg.sourceNode = thisNode;

      switch (msg.command) {
        case 'stop':
          thisNodeServerInstance.googlehomenotifier.stopPlaying(msg);
          break;

        default:
          thisNodeServerInstance.googlehomenotifier.notify(msg, (error, devicePlaySettings) => {
            if (error) {
              node_status_error(error)
            } else {
              thisNode.node_status_ready();
              thisNode.send(devicePlaySettings);
            }
          });
      }

    });

    thisNode.node_status_ready();

    /* #region  helpers */

    /* #endregion */

    //#region node notifications
    function node_status_error(message) {
      thisNode.status({
        fill: "red",
        shape: "ring",
        text: message
      });
    }
    //#endregion


  };

  RED.nodes.registerType("google-notify", GoogleNotify);


  /* #region  global helpers */
  function discoverIpAddresses(serviceType, discoveryCallback) {
    var ipaddresses = [];
    var bonjour = require('bonjour')();
    var browser = bonjour.find({
      type: serviceType
    }, function (service) {
      service.addresses.forEach(function (element) {
        if (element.split(".").length == 4) {
          const deviceTypeName = ""
            + service.txt.md
            + (service.txt.md.toLowerCase() != service.txt.fn.toLowerCase() ? "." + service.txt.fn : "");
          const label = deviceTypeName
            + " (" + element + ")";
          ipaddresses.push({
            label: label,
            device: deviceTypeName,
            value: element
          });
        }
      });

      //Add a bit of delay for all services to be discovered
      if (discoveryCallback)
        setTimeout(function () {
          discoveryCallback(ipaddresses);
        }, 2000);
    });
  }

  function mediaServerStart(nodeInstance) {
    const matchedMediaServer = mediaServers.find(servers =>
      servers.mediaServerPortInUse == nodeInstance.mediaServerPortInUse);
    if (matchedMediaServer) {
      console.log('destroying media server:', matchedMediaServer.serverInstance)
      matchedMediaServer.serverInstance.close(_ => {
        mediaServers = mediaServers.filter(servers => servers.mediaServerPortInUse != nodeInstance.mediaServerPortInUse);
        setTimeout(() => {
          mediaServerStart(nodeInstance);
        }, 1)

      });
      return;

    }
    startMediaServerInstance(nodeInstance);



  }

  function startMediaServerInstance(nodeInstance) {
    const FileServer = require('file-server');

    const fileServer = new FileServer((error, request, response) => {
      response.statusCode = error.code || 500;
      response.end("404: Not Found " + request.url);
    });

    const serveRobots = fileServer.serveDirectory(nodeInstance.cacheFolderInUse, {
      '.mp3': 'audio/mpeg'
    });

    const httpServer = require('http')
      .createServer(serveRobots)
      .listen(nodeInstance.mediaServerPortInUse);
    console.log("fileServer listening on ip " + serverIP + " and port " + nodeInstance.mediaServerPortInUse);

    mediaServers.push({
      'serverInstance': httpServer,
      'mediaServerPortInUse': nodeInstance.mediaServerPortInUse
    });
  }

  /* #endregion */

};




