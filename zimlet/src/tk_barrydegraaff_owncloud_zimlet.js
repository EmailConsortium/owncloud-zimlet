/*
 This file is part of the Zimbra ownCloud Zimlet project.
 Copyright (C) 2015  Barry de Graaff

 Bugs and feedback: https://github.com/barrydegraaff/owncloud-zimlet/issues

 This program is free software: you can redistribute it and/or modify
 it under the terms of the GNU General Public License as published by
 the Free Software Foundation, either version 3 of the License, or
 (at your option) any later version.

 This program is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU General Public License for more details.

 You should have received a copy of the GNU General Public License
 along with this program.  If not, see http://www.gnu.org/licenses/.
 */

function tk_barrydegraaff_owncloud_zimlet_HandlerObject() {
  tk_barrydegraaff_owncloud_zimlet_HandlerObject.settings = {};
}

tk_barrydegraaff_owncloud_zimlet_HandlerObject.prototype = new ZmZimletBase();
tk_barrydegraaff_owncloud_zimlet_HandlerObject.prototype.constructor = tk_barrydegraaff_owncloud_zimlet_HandlerObject;
var ownCloudZimlet = tk_barrydegraaff_owncloud_zimlet_HandlerObject;

/**
 * Initialize the context of the OwnCloud zimlet.
 * This method is invoked by Zimbra.
 */
ownCloudZimlet.prototype.init =
  function () {
    this.davConnector = new DavConnector();
    this.ownCloudConnector = new OwnCloudConnector();
    this.davForZimbraConnector = new DavForZimbraConnector();

    this._defaultPropfindErrCbk = new AjxCallback(
      this,
      this._handlePropfindError
    );

    //Set global config
    tk_barrydegraaff_owncloud_zimlet_HandlerObject.settings['proxy_location'] = this.getConfig('proxy_location');
    tk_barrydegraaff_owncloud_zimlet_HandlerObject.settings['owncloud_zimlet_dav_uri'] = this.getConfig('proxy_location') + this.getConfig('dav_path');
    tk_barrydegraaff_owncloud_zimlet_HandlerObject.settings['disable_link_sharing'] = this.getConfig('disable_link_sharing');
    tk_barrydegraaff_owncloud_zimlet_HandlerObject.settings['disable_password_storing'] = this.getConfig('disable_password_storing');

    //Set default value
    if(!this.getUserProperty("owncloud_zimlet_username"))
    {
      this.setUserProperty("owncloud_zimlet_username", '', true);
    }
    tk_barrydegraaff_owncloud_zimlet_HandlerObject.settings['owncloud_zimlet_username'] = this.getUserProperty("owncloud_zimlet_username");

    //Set default value
    if(!this.getUserProperty("owncloud_zimlet_password"))
    {
      this.setUserProperty("owncloud_zimlet_password", '', true);
    }
    tk_barrydegraaff_owncloud_zimlet_HandlerObject.settings['owncloud_zimlet_password'] = this.getUserProperty("owncloud_zimlet_password");

    //Set default value
    if(!this.getUserProperty("owncloud_zimlet_default_folder"))
    {
      this.setUserProperty("owncloud_zimlet_default_folder", 'Zimbra emails', true);
    }
    tk_barrydegraaff_owncloud_zimlet_HandlerObject.settings['owncloud_zimlet_default_folder'] = this.getUserProperty("owncloud_zimlet_default_folder");

    try {
      this.ownCloudTab = this.createApp("ownCloud", "", "ownCloud");
    } catch (err) { }

    if (appCtxt.get(ZmSetting.MAIL_ENABLED)) {
      AjxPackage.require({
        name: 'MailCore',
        callback: new AjxCallback(this, this.addAttachmentHandler)
      });
    }

    this.createFolder();
  };

/**
 * Attach the handler fired when the attachment is displayed on a message.
 */
ownCloudZimlet.prototype.addAttachmentHandler =
  function() {
    this._msgController = AjxDispatcher.run("GetMsgController");
    var viewType = appCtxt.getViewTypeFromId(ZmId.VIEW_MSG),
      i = 0,
      tmpMime,
      mimeType;
    this._msgController._initializeView(viewType);

    for (i = 0; i < ownCloudZimlet.mime.length; i += 1)
    {
      tmpMime = ownCloudZimlet.mime[i];
      if (ZmMimeTable._table.hasOwnProperty(tmpMime)) { continue; }
      ZmMimeTable._table[tmpMime] = {
        desc: ZmMsg.unknownBinaryType,
        image: "UnknownDoc",
        imageLarge: "UnknownDoc_48"
      };
    }

    for (mimeType in ZmMimeTable._table) {
      if (!ZmMimeTable._table.hasOwnProperty(tmpMime)) { continue; }
      this._msgController._listView[viewType].addAttachmentLinkHandler(mimeType, "ownCloud", tk_barrydegraaff_owncloud_zimlet_HandlerObject._addOwnCloudLink);
    }
  };

/**
 * Generate a link used to send an attachment to OwnCloud.
 * @param attachment
 * @returns {string}
 * @private
 */
ownCloudZimlet._addOwnCloudLink =
  function(attachment) {
    return "<a href='#' class='AttLink' style='text-decoration:underline;' " +
      "onClick=\"" +
      "window.tk_barrydegraaff_owncloud_zimlet_HandlerObject.saveAttachment('" + attachment.mid + "','" + attachment.part + "','" + attachment.label + "')" +
      "\">"+
      "send to ownCloud" +
      "</a>";
  };

/**
 * Show a Zimbra Status message (toast notification).
 * @param {string} text The message.
 * @param {number} type The color and the icon of the notification.
 */
ownCloudZimlet.prototype.status =
  function(text, type) {
    var transitions = [ ZmToast.FADE_IN, ZmToast.PAUSE, ZmToast.FADE_OUT ];
    appCtxt.getAppController().setStatusMsg(text, type, null, transitions);
  };

/**
 * Save an attachment to OwnCloud.
 * @param {string} mid The message id
 * @param {string} part The part of the message.
 * @param {string} label The label (usually the file name)
 * @static
 */
ownCloudZimlet.saveAttachment =
  function(mid, part, label) {
    var zimletCtxt = appCtxt.getZimletMgr().getZimletByName('tk_barrydegraaff_owncloud_zimlet').handlerObject;
    zimletCtxt.saveAttachment(mid, part, label);
  };

/**
 * Save an attachment to OwnCloud.
 * @param {string} mid The message id
 * @param {string} part The part of the message.
 * @param {string} label The label (usually the file name)
 */
ownCloudZimlet.prototype.saveAttachment =
  function(mid, part, label) {
    var createFolderCbk,
      propfindCbk;

    propfindCbk = new AjxCallback(
      this,
      this._saveAttachmentPropfindCbk,
      [mid, part, label]
    );

    createFolderCbk = new AjxCallback(
      this.davConnector,
      this.davConnector.propfind,
      [
        this.getConfig('owncloud_zimlet_default_folder'),
        1,
        propfindCbk,
        this._defaultPropfindErrCbk
      ]
    );

    this.status('Saving to ownCloud', ZmStatusView.LEVEL_INFO);
    this.createFolder(createFolderCbk);
  };

/**
 * Save an attachment to OwnCloud.
 * @param {string} mid The message id
 * @param {string} part The part of the message.
 * @param {string} fileName The file name
 * @private
 */
ownCloudZimlet.prototype._saveAttachmentPropfindCbk =
  function(mid, part, fileName) {
    this.davForZimbraConnector.sendMailAttachmentToDav(
      mid,
      part,
      fileName
    );
  };

/**
 * Called by framework when attach popup called
 */
ownCloudZimlet.prototype.initializeAttachPopup =
  function(menu, controller) {
    controller._createAttachMenuItem(menu, 'ownCloud', this.showAttachmentDialog.bind(this), "ATTACH_MENU_OWNCLOUD");
  };

ownCloudZimlet.prototype.removePrevAttDialogContent =
  function(contentDiv) {
    var elementNode =  contentDiv && contentDiv.firstChild;
    if (elementNode && elementNode.className == "DwtComposite" ){
      contentDiv.removeChild(elementNode);
    }
  };

ownCloudZimlet.prototype.showAttachmentDialog =
  function() {
    var zimlet = this;
    var xmlHttp = null;
    xmlHttp = new XMLHttpRequest();
    xmlHttp.open( "GET", tk_barrydegraaff_owncloud_zimlet_HandlerObject.settings['owncloud_zimlet_dav_uri'] + "/" + tk_barrydegraaff_owncloud_zimlet_HandlerObject.settings['owncloud_zimlet_default_folder'], true );
    xmlHttp.setRequestHeader("Authorization", "Basic " + string.encodeBase64(tk_barrydegraaff_owncloud_zimlet_HandlerObject.settings['owncloud_zimlet_username'] + ":" + tk_barrydegraaff_owncloud_zimlet_HandlerObject.settings['owncloud_zimlet_password']));
    xmlHttp.send( null );

    xmlHttp.onload = function(e)
    {
      if(xmlHttp.status == 401)
      {
        zimlet.displayDialog(1, 'Preferences', null);
      }
      else
      {
        var attachDialog = zimlet._attachDialog = appCtxt.getAttachDialog();
        attachDialog.setTitle('Attach from ownCloud');
        zimlet.removePrevAttDialogContent(attachDialog._getContentDiv().firstChild);
        if (!zimlet.AttachContactsView || !zimlet.AttachContactsView.attachDialog){
          zimlet.AMV = new ownCloudTabView(zimlet._attachDialog, this);
        }

        zimlet.AMV.reparentHtmlElement(attachDialog._getContentDiv().childNodes[0], 0);
        zimlet.AMV.attachDialog = attachDialog;
        attachDialog.setOkListener(new AjxCallback(zimlet.AMV, zimlet.AMV._uploadFiles));

        var view = appCtxt.getCurrentView();
        var callback = new AjxCallback(view, view._attsDoneCallback, [true]);
        attachDialog.setUploadCallback(callback);

        zimlet.AMV.attachDialog.popup();
        zimlet._addedToMainWindow = true;
      }
    }
  };

/**
 * Called when the panel is double-clicked.
 */
ownCloudZimlet.prototype.doubleClicked =
  function() {
    this.singleClicked();
  };

/**
 * Called when the panel is single-clicked.
 */
ownCloudZimlet.prototype.singleClicked =
  function() {
    this.displayDialog(1, 'Preferences', null);
  };

/**
 * Context menu handler
 */
ownCloudZimlet.prototype.menuItemSelected =
  function(itemId) {
    switch (itemId) {
      case "preferences":
        this.displayDialog(1, 'Preferences', null);
        break;
      case "help":
        window.open("/service/zimlet/_dev/tk_barrydegraaff_owncloud_zimlet/help/index.html");
        break;
    }
  };

/**
 * Handle the action 'drop' on the Zimlet Menu Item.
 * @param {ZmItem[]} zmObjects Objects dropped on the Zimlet Menu Item.
 */
ownCloudZimlet.prototype.doDrop =
  function(zmObjects) {
    var createFolderCbk,
      propfindCbk;

    propfindCbk = new AjxCallback(
      this,
      this._doDropPropfindCbk,
      [zmObjects]
    );

    createFolderCbk = new AjxCallback(
      this.davConnector,
      this.davConnector.propfind,
      [
        this.getConfig('owncloud_zimlet_default_folder'),
        1,
        propfindCbk,
        this._defaultPropfindErrCbk
      ]
    );

    this.createFolder(createFolderCbk);
  };

/**
 * Send a list of ZmObjects to OwnCloud.
 * The real copy will be made on the server, this optimization will avoid to saturate the user bandwidth.
 * @param {ZmItem[]} zmObjects Objects to send to OwnCloud.
 * @param {DavResource[]} resources
 * @param {AjxCallback=} callback Callback invoked with the result.
 * @param {AjxCallback=} errorCallback Callback invoked when an error occurs.
 * @private
 */
ownCloudZimlet.prototype._doDropPropfindCbk =
  function(zmObjects, resources, callback, errorCallback) {
    var id,
      type = "MESSAGE",
      iObj = 0,
      tmpObj;
    this.status('Saving to ownCloud', ZmStatusView.LEVEL_INFO);


    if (!zmObjects[0]) {
      zmObjects = [zmObjects];
    }

    for (iObj = 0; iObj < zmObjects.length; iObj += 1) {
      tmpObj = zmObjects[iObj];
      if (tmpObj.id < 0) {
        id = tmpObj.id * -1;
      } else {
        id = tmpObj.id;
      }

      //if its a conversation i.e. 'ZmConv' object, get the first loaded message 'ZmMailMsg' object within that.
      if (tmpObj.TYPE == 'ZmConv') {
        var msgObj = tmpObj.srcObj; // get access to source-object
        msgObj = msgObj.getFirstHotMsg();
        tmpObj.id = msgObj.id;
        type = 'MESSAGE';
      }

      if (tmpObj.type == 'BRIEFCASE_ITEM') {
        type = 'DOCUMENT';
      } else if (tmpObj.TYPE == 'ZmContact') {
        type = 'CONTACT';
      } else if (tmpObj.TYPE == 'ZmAppt') {
        type = 'APPOINTMENT';
      } else if (tmpObj.type == 'TASK') {
        type = 'TASK';
      }
      this.davForZimbraConnector.sendItemToDav(
        type,
        id,
        callback,
        errorCallback
      );
    }
  };

/**
 * Manage the error occurred during the PROPFIND donw to check if the zimlet can upload something on OwnCloud.
 * @param {number} statusCode
 * @private
 */
ownCloudZimlet.prototype._handlePropfindError =
  function(statusCode)
  {
    if((!this.getConfig('owncloud_zimlet_password') || this.getConfig('owncloud_zimlet_password') === '') && statusCode == 401)
    {
      this.displayDialog(1, 'Preferences', null);
    }
    else
    {
      this.status('DAV Error ' + statusCode, ZmStatusView.LEVEL_CRITICAL);
    }
  };

/**
 * Create the 'Zimbra mails' folder (or the user defined one).
 * @param {ZmZimletContext=} zimlet Context of the zimlet.
 * @param {AjxCallback=} callback Callback invoked with the result.
 * @param {AjxCallback=} errorCallback Callback invoked when an error occurs.
 */
ownCloudZimlet.prototype.createFolder =
  function(callback, errorCallback) {
    this.davConnector.mkcol(
      '/' + this.getConfig('owncloud_zimlet_default_folder'),
      new AjxCallback(
        this,
        this._createFolderCallback,
        [callback, errorCallback]
      )
    );
  };

/**
 * Callback invoked when a file is created.
 * @param {} status
 */
ownCloudZimlet.prototype.createFileCallback =
  function(status) {
    //201 == created
    //405 == already there
    //Other status codes are not a good sign
    if (!!console && !!console.log) {
      console.log('------------------------------------- DAV response: ' + status);
    }
  };

/**
 * Callback invoked when a folder is created.
 * @param {AjxCallback=} callback
 * @param {AjxCallback=} errorCallback
 * @param {number} statusCode
 * @private
 */
ownCloudZimlet.prototype._createFolderCallback =
  function(callback, errorCallback, statusCode) {
    if (statusCode === 201 || statusCode === 405) {
      // 201 == created
      // 405 == already there
      if (!!callback) callback.run(statusCode);
    } else {
      // Other status codes are not a good sign
      if (!!errorCallback) errorCallback.run(statusCode);
    }
  };

ownCloudZimlet.prototype.appLaunch =
  function(appName) {
    var app = appCtxt.getApp(appName);
    app.setContent(
      '<div style="position: fixed; left:0; width:100%; height:100%; border:0px;">' +
      '<iframe id="ownCloudFrame" style="z-index:2; left:0; width:100%; height:100%; border:0px;" src="/service/extension/owncloud">' +
      '</div>'
    );
    var overview = app.getOverview(); // returns ZmOverview
    overview.setContent("&nbsp;");
    var child = document.getElementById(overview._htmlElId);
    child.parentNode.removeChild(child);

    var toolbar = app.getToolbar(); // returns ZmToolBar
    toolbar.setContent("<div style=\"padding:5px\"><button onclick=\"if(document.getElementById('ownCloudFrame').src.indexOf('"+tk_barrydegraaff_owncloud_zimlet_HandlerObject.settings['proxy_location']+"') < 0){this.innerHTML='Help'; document.getElementById('ownCloudFrame').src = '"+tk_barrydegraaff_owncloud_zimlet_HandlerObject.settings['proxy_location']+"'} else {this.innerHTML='Back to ownCloud'; document.getElementById('ownCloudFrame').src = '/service/zimlet/_dev/tk_barrydegraaff_owncloud_zimlet/help/index.html'}\">Help</button>&nbsp;&nbsp;<b>ownCloud Zimlet version: " + ownCloudZimlet.version + "</b></div>" );
  };

/**
 * This method gets called by the Zimlet framework each time the application is opened or closed.
 *
 * @param	{String}	appName		the application name
 * @param	{boolean}	active		if true, the application status is open; otherwise, false
 */
ownCloudZimlet.prototype.appActive =
  function(appName, active) {
    if (active)
    {
      //In the ownCloud Zimbra tab hide the left menu bar that is displayed by default in Zimbra, also hide the mini calendar
      document.getElementById('z_sash').style.display = "none";
      //Users that click the ownCloud tab directly after logging in, will still be served with the calendar, as it is normal
      //it takes some time to be displayed, so if that occurs, try to remove the calender again after 10 seconds.
      try {
        var cal = document.getElementsByClassName("DwtCalendar");
        cal[0].style.display = "none";
      } catch (err) { setTimeout(function(){var cal = document.getElementsByClassName("DwtCalendar"); cal[0].style.display = "none"; }, 10000); }
    }
    else
    {
      document.getElementById('z_sash').style.display = "block";
      try {
        var cal = document.getElementsByClassName("DwtCalendar");
        cal[0].style.display = "block";
      } catch (err) { }
    }
  };


/* displays dialogs.
 */
ownCloudZimlet.prototype.displayDialog =
  function(id, title, message) {
    switch(id) {
      case 1:
        //Default dialog
        this._dialog = new ZmDialog({
          title: title,
          parent: this.getShell(),
          standardButtons: [DwtDialog.OK_BUTTON, DwtDialog.CANCEL_BUTTON],
          disposeOnPopDown: true
        });
        var username = appCtxt.getActiveAccount().name.match(/.*@/),
          html,
          serverName = location.protocol + '//' + location.hostname;
        username = username[0].replace('@','');
        html = "<div style='width:500px; height: 200px;'>To store an email or attachment in ownCloud, drag it onto the ownCloud icon.<br><br>" +
          "<table>"+
          "<tr>" +
          "<td>Username:&nbsp;</td>" +
          "<td style='width:98%'><input style='width:98%' type='text' id='owncloud_zimlet_username' value='"+(this.getUserProperty('owncloud_zimlet_username') ? this.getUserProperty('owncloud_zimlet_username') : username)+"'></td>" +
          "</tr>" +
          "<tr>" +
          "<td>Password:</td>" +
          "<td><input style='width:98%' type='password' id='owncloud_zimlet_password' value='"+(this.getUserProperty('owncloud_zimlet_password') ? this.getUserProperty('owncloud_zimlet_password') : this.getConfig('owncloud_zimlet_password'))+"'></td>" +
          "</tr>" +
          "<tr>" +
          "<td>Server:&nbsp;</td>" +
          "<td style='width:98%'><input style='width:98%' type='text' id='owncloud_zimlet_server_name' value='"+(this.getUserProperty('owncloud_zimlet_server_name') ? this.getUserProperty('owncloud_zimlet_server_name') : serverName)+"'></td>" +
          "</tr>" +
          "<tr>" +
          "<td>Port:&nbsp;</td>" +
          "<td style='width:98%'><input style='width:50px' type='number' min='1' max='65535' id='owncloud_zimlet_server_port' value='"+(this.getUserProperty('owncloud_zimlet_server_port') ? this.getUserProperty('owncloud_zimlet_server_port') : ((location.protocol === 'https:') ? 443 : 80))+"'></td>" +
          "</tr>" +
          "<tr>" +
          "<td>Path:&nbsp;</td>" +
          "<td style='width:98%'><input style='width:98%' type='text' id='owncloud_zimlet_server_path' value='"+(this.getUserProperty('owncloud_zimlet_server_path') ? this.getUserProperty('owncloud_zimlet_server_path') : this.getConfig('owncloud_zimlet_server_path'))+"'></td>" +
          "</tr>" +
          "<tr>" +
          "<td>Default folder:&nbsp;</td>" +
          "<td><input style='width:98%' type='text' id='owncloud_zimlet_default_folder' value='"+this.getUserProperty('owncloud_zimlet_default_folder')+"'></td>" +
          "</tr>" +
          "</table>" +
          "</div>";
        this._dialog.setContent(html);
        this._dialog.setButtonListener(DwtDialog.OK_BUTTON, new AjxListener(this, this.prefSaveBtn));
        this._dialog.setButtonListener(DwtDialog.CANCEL_BUTTON, new AjxListener(this, this.cancelBtn));
        break;
    }
    this._dialog._setAllowSelection();
    this._dialog.popup();
  };

/* This method is called when the dialog "CANCEL" button is clicked
 */
ownCloudZimlet.prototype.cancelBtn =
  function() {
    try{
      this._dialog.setContent('');
      this._dialog.popdown();
    }
    catch (err) {
    }
  };

/**
 * This method is called when the dialog "OK" button is clicked in preferences
 */
ownCloudZimlet.prototype.prefSaveBtn =
  function() {
    this.setUserProperty('owncloud_zimlet_server_name', document.getElementById('owncloud_zimlet_server_name').value, false);
    this.setUserProperty('owncloud_zimlet_server_port', document.getElementById('owncloud_zimlet_server_port').value, false);
    this.setUserProperty('owncloud_zimlet_server_path', document.getElementById('owncloud_zimlet_server_path').value, false);
    this.setUserProperty('owncloud_zimlet_username', document.getElementById('owncloud_zimlet_username').value, false);
    this.setUserProperty('owncloud_zimlet_password', document.getElementById('owncloud_zimlet_password').value, false);
    this.setUserProperty('owncloud_zimlet_default_folder', document.getElementById('owncloud_zimlet_default_folder').value, false);
    this.createFolder();
    this.cancelBtn();
  };

ownCloudZimlet.prototype.readSubFolder =
  function(divId) {
    var client = new davlib.DavClient();
    client.initialize(location.hostname, 443, 'https', tk_barrydegraaff_owncloud_zimlet_HandlerObject.settings['owncloud_zimlet_username'], tk_barrydegraaff_owncloud_zimlet_HandlerObject.settings['owncloud_zimlet_password']);
    client.PROPFIND(divId,  ownCloudZimlet.prototype.readFolderAsHTMLCallback, document.getElementById(divId), 1);
  };

ownCloudZimlet.prototype.existingShares =
  function() {
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open("GET",tk_barrydegraaff_owncloud_zimlet_HandlerObject.settings['proxy_location']+ "/ocs/zcs.php?proxy_location=" + tk_barrydegraaff_owncloud_zimlet_HandlerObject.settings['proxy_location'] + "&zcsuser="+tk_barrydegraaff_owncloud_zimlet_HandlerObject.settings['owncloud_zimlet_username'] + "&zcspass=" + tk_barrydegraaff_owncloud_zimlet_HandlerObject.settings['owncloud_zimlet_password'] + "&path=getshares", false);
    xmlHttp.send( null );

    if(xmlHttp.response.length > 2)
    {
      var existingShares = JSON.parse(xmlHttp.response);
      for (var share in existingShares) {
        if(document.getElementById(escape("/"+tk_barrydegraaff_owncloud_zimlet_HandlerObject.settings['owncloud_zimlet_dav_uri'].replace("/","")+share)+'-span'))
        {
          if(document.getElementById(escape("/"+tk_barrydegraaff_owncloud_zimlet_HandlerObject.settings['owncloud_zimlet_dav_uri'].replace("/","")+share)+'-span').innerHTML.indexOf('/tk_barrydegraaff_owncloud_zimlet/exclam.png') < 1)
          {
            document.getElementById(escape("/"+tk_barrydegraaff_owncloud_zimlet_HandlerObject.settings['owncloud_zimlet_dav_uri'].replace("/","")+share)+'-span').innerHTML += " <img class=\"ownCloudShareExists\"title=\"Existing share will be replaced and will no longer work!\"style=\"vertical-align: bottom;\" src=\"/service/zimlet/_dev/tk_barrydegraaff_owncloud_zimlet/exclam.png\">";
          }
        }
      }
    }
  };

ownCloudZimlet.prototype.removeElementsByClass =
  function (className){
    var elements = document.getElementsByClassName(className);
    while(elements.length > 0){
      elements[0].parentNode.removeChild(elements[0]);
    }
  };


ownCloudZimlet.prototype.readFolderAsHTMLCallback =
  function(status, statusstr, content) {
    var rawDavResponse = content.split('<d:response>');
    var davResult = [];
    var resultCount = 0;
    rawDavResponse.forEach(function(response) {
      if (resultCount > 0 )
      {
        if (!davResult[resultCount])
        {
          davResult[resultCount] = [];
        }
        var href = response.match(/<d:href>.*<\/d:href>/);
        davResult[resultCount]['href'] = href[0].replace(/(<d:href>|<\/d:href>)/gm,"");;
        davResult[resultCount]['isDirectory'] = "false";
        var level = (davResult[resultCount]['href'].split("/").length - 1) - (tk_barrydegraaff_owncloud_zimlet_HandlerObject.settings['owncloud_zimlet_dav_uri'].split("/").length - 1);
        davResult[resultCount]['level'] = level;

        var getcontentlength = response.match(/<d:getcontentlength>.*<\/d:getcontentlength>/);
        if(!getcontentlength)
        {
          //This is a directory
          getcontentlength = [];
          getcontentlength[0]="0";
          if(response.indexOf('<d:resourcetype><d:collection/></d:resourcetype>') > -1)
          {
            davResult[resultCount]['isDirectory'] = "true";
            davResult[resultCount]['level'] = davResult[resultCount]['level'] - 1;
            if (davResult[resultCount]['level'] == -1)
            {
              davResult[resultCount]['level'] = 1;
            }
          }
        }
        davResult[resultCount]['getcontentlength'] = getcontentlength[0].replace(/(<d:getcontentlength>|<\/d:getcontentlength>)/gm,"");;
      }
      resultCount++;
    });

    var html = "";
    //handle folders
    davResult.forEach(function(item) {
      if(item['isDirectory']=="true")
      {
        if(unescape(item['href'].replace(tk_barrydegraaff_owncloud_zimlet_HandlerObject.settings['owncloud_zimlet_dav_uri'],"").replace("/","")))
        {
          var displayFolder = unescape(item['href'].replace(tk_barrydegraaff_owncloud_zimlet_HandlerObject.settings['owncloud_zimlet_dav_uri'],"")).match(/.*\/([^\/]+)\/[^\/]*$/);
          if(!displayFolder)
          {
            displayFolder = unescape(item['href'].replace(tk_barrydegraaff_owncloud_zimlet_HandlerObject.settings['owncloud_zimlet_dav_uri'],"")).replace("/","");
          }
          else
          {
            displayFolder = displayFolder[1];
          }
          html += "<div id=\""+item['href']+"\" onclick=\"ownCloudZimlet.prototype.readSubFolder('"+item['href']+"')\"style=\"display: inline-block; ;width:99%; padding:2px;\"><img style=\"vertical-align: middle; margin-left:"+item['level']*16+"px\" src=\"/service/zimlet/_dev/tk_barrydegraaff_owncloud_zimlet/folder.png\"><span id=\""+item['href']+"-span\" style=\"vertical-align: middle;  display: inline-block;\">&nbsp;"+displayFolder+"</span></div>";

        }
      }
    });

    //handle files
    davResult.forEach(function(item) {
      if(item['isDirectory']=="false")
      {
        if(unescape(item['href'].replace(tk_barrydegraaff_owncloud_zimlet_HandlerObject.settings['owncloud_zimlet_dav_uri'],"").replace("/","")))
        {
          var fileName = item['href'].match(/(?:[^/][\d\w\.]+)+$/);
          fileName = decodeURI(fileName[0]);
          html += "<div style=\"display: inline-block; ;width:99%; padding:2px;\"><input style=\"vertical-align: middle; margin-left:"+(2+item['level']*16)+"px\" class=\"ownCloudSelect\" type=\"checkbox\" id=\""+item['href']+"\" value=\""+item['href']+"\"><span id=\""+item['href']+"-span\" style=\"vertical-align: middle;  display: inline-block;\">&nbsp;"+fileName+"</span></div>";
        }
      }
    });
    this.onclick = null;
    this.innerHTML = html;
    if(document.getElementById('shareType').value != 'attach')
    {
      ownCloudZimlet.prototype.existingShares();
    }
    OwnCloudTabView.attachment_ids = [];
  };


/* This method generates a password
 */
ownCloudZimlet.prototype.pwgen =
  function ()
  {
    chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
    pass = "";

    for(x=0;x<10;x++)
    {
      i = Math.floor(Math.random() * 62);
      pass += chars.charAt(i);
    }
    return pass;
  };