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

    this.googlehomenotifier.setMaxListeners(Infinity);


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
    if(this.nodeInFlow.language=='config') this.nodeInFlow.language=undefined;
    if(this.nodeInFlow.playVolumeLevel=='') this.nodeInFlow.playVolumeLevel=undefined;
    if(this.nodeInFlow.speakSlow=='config') this.nodeInFlow.speakSlow=undefined;
    if(this.nodeInFlow.playMessage=='') this.nodeInFlow.playMessage=undefined;

    const thisNode = this;
    const thisNodeServerInstance = RED.nodes.getNode(nodeInFlow.server);

    if (thisNodeServerInstance === null || thisNodeServerInstance === undefined) {
      node_status_error("please assign node to a cast device")
      return;
    }

    thisNode.on('input', function (msg) {
      msg.playVolumeLevel = (msg.hasOwnProperty('playVolumeLevel') ? msg.playVolumeLevel : this.nodeInFlow.playVolumeLevel);
      msg.playMessage = (msg.hasOwnProperty('playMessage') ? msg.playMessage : this.nodeInFlow.playMessage);
      msg.language = (msg.hasOwnProperty('language') ? msg.language : this.nodeInFlow.language);
      msg.speakSlow = (msg.hasOwnProperty('speakSlow') ? msg.speakSlow : this.nodeInFlow.speakSlow);
      msg.mediaUrl = (msg.hasOwnProperty('mediaUrl') ? msg.mediaUrl : this.nodeInFlow.mediaUrl);

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

      node_status("preparing voice message")

      console.log("new message -----");

      thisNodeServerInstance.googlehomenotifier
        .notify(msg)
        .then(devicePlaySettings => {
          node_status_ready();
          thisNode.send(devicePlaySettings);
        })
        .catch(e =>
          node_status_error(e));
    });

    thisNodeServerInstance.googlehomenotifier.on('status', function (message) {
      node_status(message);
    });

    thisNodeServerInstance.googlehomenotifier.on('error', function (message) {
      node_status_error(message);
    });

    node_status_ready();

    /* #region  helpers */

    /* #endregion */

    //#region node notifications
    function node_status(message) {
      thisNode.status({
        fill: "blue",
        shape: "dot",
        text: message
      });
    }

    function node_status_ready() {
      thisNode.status({
        fill: "green",
        shape: "dot",
        text: "ready"
      });
    }

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




