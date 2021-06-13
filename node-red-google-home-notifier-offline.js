'use strict';
var mediaServers = [];
const serverIP = require("ip").address();
const defaultServerPort = "8089";
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

    //Known issue: when 'language' is Default/Auto, this will fail & return undefined
    this.mediaServerPortInUse = (nodeServer.mediaServerPort ? nodeServer.mediaServerPort : defaultServerPort);
    this.cacheFolderInUse = (nodeServer.cacheFolder ? nodeServer.cacheFolder : defaultCacheFolder);

    mediaServerStart(this);

    this.googlehomenotifier = require('google-notify')(
      nodeServer.ipaddress,
      nodeServer.language,
      1,
      serverIP,
      this.mediaServerPortInUse,
      this.cacheFolderInUse,
      (nodeServer.notificationLevel ? nodeServer.notificationLevel / 100 : 0.2)
    );

    this.googlehomenotifier.setMaxListeners(Infinity);


    //Build another API to auto detect IP Addresses
    discoverIpAddresses('googlecast', function (ipaddresses) {
      RED.httpAdmin.get('/ipaddresses', function (req, res) {
        res.json(ipaddresses);
      });
    });
  };

  RED.nodes.registerType("google-notify-config", GoogleNotifyConfig);

  //--------------------------------------------------------

  function GoogleNotify(nodeInFlow) {
    RED.nodes.createNode(this, nodeInFlow);
    const nodeInstance = this;
    const nodeServerInstance = RED.nodes.getNode(nodeInFlow.server);

    if (nodeServerInstance === null || nodeServerInstance === undefined) {
      node_status_error("please assign node to a cast device")
      return;
    }

    nodeInstance.on('input', function (msg) {
      //Validate config node
      if (nodeServerInstance === null || nodeServerInstance === undefined) {
        nodeInstance.status({
          fill: "red",
          shape: "ring",
          text: "please create & select a config node"
        });
        return;
      }

      //Workaround for a known issue
      if (nodeServerInstance.googlehomenotifier === null || nodeServerInstance.googlehomenotifier === undefined) {
        node_status_error("please select a non-Default language")
        return;
      }

      applySettingsFromMessage(msg);

      node_status("preparing voice message")
      
      console.log("new message -----");

      nodeServerInstance.googlehomenotifier
        .notify(msg.payload)
        .then(_ =>
          node_status_ready())
        .catch(e =>
          node_status_error(e));
    });

    nodeServerInstance.googlehomenotifier.on('status', function (message) {
      node_status(message);
    });

    nodeServerInstance.googlehomenotifier.on('error', function (message) {
      node_status_error(message);
    });

    node_status_ready();

    /* #region  helpers */
    function applySettingsFromMessage(msg) {
      if (msg.emitVolume) {
        nodeServerInstance.googlehomenotifier.setEmitVolume(msg.emitVolume);
      }
      if (msg.speed) {
        nodeServerInstance.googlehomenotifier.setSpeechSpeed(msg.speed);
      }
    }
    /* #endregion */

    //#region node notifications
    function node_status(message) {
      nodeInstance.status({
        fill: "blue",
        shape: "dot",
        text: message
      });
    }

    function node_status_ready() {
      nodeInstance.status({
        fill: "green",
        shape: "dot",
        text: "ready"
      });
    }

    function node_status_error(message) {
      nodeInstance.status({
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
          var label = "" + service.txt.md + " (" + element + ")";
          ipaddresses.push({
            label: label,
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
      console.log('destroying media server:',matchedMediaServer.serverInstance)
      matchedMediaServer.serverInstance.close(_=>{
        mediaServers = mediaServers.filter(servers => servers.mediaServerPortInUse != nodeInstance.mediaServerPortInUse);
        setTimeout(()=>{
          mediaServerStart(nodeInstance);
        },1)
        
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





