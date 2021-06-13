# node-red-google-notify

### Releases:
| Version   |Comment|
| ----------|:-------------:|
| 1.0.0     | Initial  release


### Description:

With this node you can cast text notification to any google cast device (e.g. google home, chrome cast ...)
The text of the **msg.payload** is converted to mp3 audio and stored in the cache folder. Each cast device has it's own local media server. Thus the google cast device plays the mp3 notification from your device hosting node-red.

The played message is the available to anyone by calling the url.
If you play the notifiation ** this is a test** the you will find a file in the cache folder named like 
```
THIS_IS_A_TEST-en-slow.mp3
```
* THIS_IS_A_TEST -> notification text (msg.payload)
* en -> english language
* slow -> speak speed can be slow/normal

This mp3 audio notification is then available at http://[ip]:[port]/THIS_IS_A_TEST-en-slow.mp3

### Features:
* The notification is played at defined volume level and the inital **volume level** of the casting device is **restored** after notification has been played.
The notification level can be defined in the device configuration and overriden anytime using **msg.emitVolume**

* The notification play speed can be defined as normal or slow. The speed can be set as default value in the node config or altered by the message **msg.speakSlow = true**

* The language can also be altered with **msg.lang** The list of available languages can be checked <a href="https://github.com/orcema/node-red-google-notify/blob/master/languages.js">here</a>

* Config sample

<img src="https://github.com/orcema/node-red-google-notify/blob/master/assets/configSample.png"></img>
