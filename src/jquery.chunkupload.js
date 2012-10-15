;(function($) {
/**
 *  chunkupload
 *  
 *  @author coltware@gmail.com
 */
var pluginName = 'chunkupload';
var debug = true;

var def_opts = {
	chunkSize: 	2097152,
	url: "",
	firstRequest: null
};

function _debug(msg){
	if(console && debug){
		console.log("[chunkupload]:" + msg);
	}
}

function _uid(){
	return Math.random().toString(36).substr(2);
}

function _push_stack(upload,item){
	
	var chunkData;
	var chunkSize = upload.opts['chunkSize'];
	var start     = item.chunk.loaded * chunkSize;
	var end       = ( item.chunk.loaded + 1 ) * chunkSize;
	
	if(item.size.total < end){
		end = item.size.total;
	}
	
	var file = item.file;
	
	if(file.slice){
		chunkData = file.slice(start,end);
	}
	else if(file.webkitSlice){
		chunkData = file.webkitSlice(start,end);
	}
	else if(file.mozSlice){
		chunkData = file.mozSlice(start,end);
	}
	item.chunk.loaded++;
	var data = new ChunkDataItem(chunkData, start, end);
	upload.data.push(data);
	
	if(upload.uploading == false){
		upload.uploading = true;
		_upload_to_server(upload,item);
	}
}

function _upload_to_server(upload,item){
	
	if(item.chunk.upload == 0 && item.firstRequest == false){
		// first request
		item.firstRequest = true;
		if(upload.opts['firstRequest']){
			var fr = upload.opts['firstRequest'];
			var url = fr.url;
			var data = null;
			if(jQuery.isFunction(fr.data)){
				data = fr.data(item.file);
			}
			else{
				data = fr.data;
			}
			jQuery.ajax({
					type: 'POST',
					dataType: 'json',
					data: data,
					url : url,
					success: function(json){
						item.firstResponse = json;
						if(fr.uid){
							if(jQuery.isFunction(fr.uid)){
								item.uid = fr.uid(json);
							}
							else{
								item.uid = fr.uid;
							}
						}
						_upload_to_server(upload,item);
					},
					error: function(xhr,textStatus,errorThrown){
						item.element.trigger('error',item.file);
						var _cur = upload.itemStack.shift();
						if(upload.itemStack.length > 0){
							 _debug("next file ...[" + upload.itemStack[0].file.name + "]");
							 upload.upload(upload.itemStack[0]);
						}
						upload.uploading = false;
					}
			});
			return true;
		}
	}
	
	if(item.chunk.upload == item.chunk.total){
		 var _cur = upload.itemStack.shift();
		 _cur.element.trigger('complete',_cur.file);
		 if(upload.itemStack.length > 0){
			 _debug("next file ...[" + upload.itemStack[0].file.name + "]");
			 upload.upload(upload.itemStack[0]);
		 }
		 upload.uploading = false;
		 return true;
	}
	
	var chunkData = upload.data.shift();
	if(chunkData){
		
		item.chunk.upload++;
		
		var xhr = new XMLHttpRequest();
		var url = upload.opts['url'];
		if(url){
			url = url.replace('{0}',encodeURI(item.uid));
			url = url.replace('{1}',item.chunk.upload);
			url = url.replace('{2}',item.chunk.total);
			
			xhr.open("POST",url);
			
			xhr.setRequestHeader('Content-Type','application/octet-stream');
			xhr.setRequestHeader('X-Content-Range-Start',chunkData.start);
			xhr.setRequestHeader('X-Content-Range-End',chunkData.end);
			xhr.setRequestHeader('X-Content-Name',encodeURI(item.file.name));
			xhr.setRequestHeader('X-Content-Type',encodeURI(item.file.type));
			xhr.setRequestHeader('X-Content-Length',item.file.size);
			
			xhr.onload = function(e){
				
				var res = xhr.responseText;
				var ctype = xhr.getResponseHeader("Content-Type");
				if(ctype && ctype == 'application/json'){
					var json = jQuery.parseJSON(res);
					item.response = json;
				}
				item.element.trigger('progress',item);
				_upload_to_server(upload, item);
				
			};
			item.element.trigger('beforeSend',xhr);
			xhr.send(chunkData.data);
		}
	}
	else{
		upload.uploading = false;
	}
	
};

var StackItem = function(file,element){
	this.file = file;
	this.element = element;
	
	this.size = {
		total  : 0,
		loaded : 0
	};
	
	this.chunk = {
		total : 0,
		loaded: 0,
		upload: 0,
	};
	this.uid = null;
	this.firstRequest = false;
	this.firstResponse = null;
	this.response = {};
}

var ChunkDataItem = function(data,start,end){
	this.data = data;
	this.start = start;
	this.end = end;
}

var ChunkUpload = function(element,options){
	this.uploading = false;
	this.element = element;
	this.targetElement = null;
	this.itemStack = null;
	
	this.opts = options;
	
	this.data = new Array();
	this.init(element);
	return this;
};

ChunkUpload.prototype.init = function(element){
	this.itemStack = new Array();
	
	if(element.length == 1){
		this.targetElement = $(element[0]);
		var name = element[0].tagName;
		if(name == 'INPUT'){
			
		}
		else{
			var te = this.targetElement;
			this.targetElement.on('dragover',function(evt){
				evt.preventDefault();
			});
			this.targetElement.on('drop',function(evt){
				evt.stopPropagation();
				evt.preventDefault();
				var files = evt.dataTransfer.files;
				
				for(var i=0; i<files.length; i++){
					var file = files[0];
					te.trigger('ready',file);
				}
			});
		}
	}
};

ChunkUpload.prototype.start = function(file,element){
	var ele = this.targetElement;
	if(element){
		ele = element;
	}
	var item = new StackItem(file, ele);
	item.uid = _uid();
	this.itemStack.push(item);
	
	if(this.itemStack.length > 1){
		_debug('waitting :queue size [' + this.itemStack.length + ']');
	}
	else{
		this.upload(item);
	}
};

ChunkUpload.prototype.upload = function(item){
	var reader = new FileReader();
	var upload = this;
	var ele = item.element;
	
	reader.onprogress = function(event){
		ele.trigger('readProgress');
		if(event.lengthComputable){
			item.size.total = event.total;
			item.size.loaded = event.loaded;
			
			var chunkSize = upload.opts.chunkSize;
			if(item.chunk.total == 0){
				var tc = event.total / chunkSize;
				item.chunk.total = Math.floor(tc);
				if(event.total % chunkSize > 0){
					item.chunk.total++;
				}
			}
			var size = (item.chunk.loaded + 1) * chunkSize;
			if(size < event.loaded){
				_push_stack(upload, item);
			}
		}
	};
	reader.onloadend = function(event){
		if(event.lengthComputable){
			item.size.total = event.total;
			item.size.loaded = event.loaded;
			
			var chunkSize  = upload.opts['chunkSize'];
			var pushedSize = item.chunk.loaded * chunkSize;
			while(pushedSize < event.total){
				_push_stack(upload, item);
				pushedSize = item.chunk.loaded * chunkSize;
			}
		}
	}
	
	ele.trigger('beforeRead');
	reader.readAsBinaryString(item.file);
}



$.fn[pluginName] = function(options){
	if(!window.File){
		throw jQuery.error("This Browser does NOT support File API");
	}
	jQuery.event.props.push('dataTransfer');
	var ret = new ChunkUpload(this,$.extend(def_opts,options,{}));
	return ret;
};

})(jQuery);