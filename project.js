/* light */
var light = {
  animate: true,
  loc: null,
  value: new Float32Array([-3.0, 2.0, 0.0]),
  angle: 0
};

var shadow = {
  ortho_size: 5,
  set_ortho_size: function(){
    light_projection_martix = ortho( -1*shadow.ortho_size,
                                      1*shadow.ortho_size,
                                     -1*shadow.ortho_size,
                                      1*shadow.ortho_size,
                                      1.0, 9.0 );
    return light_projection_martix;
  },
  debug_map:        false,
  debug_shadow:     false,
  debug_vsm_shadow: false,
  use_filter: true,
  type: 'vsm',
  types: {
    'shadow_mapping': 3,
    'shadow_mapping+pcf': 1,
    'vsm': 2
  }
}

var light_projection_martix = shadow.set_ortho_size();
var camera_perspective_matrix = perspective(45.0, 1, 0.01, 130.0);
var look_at = vec3(0.0, -1.0, 0.0);

var Model = function(obj_file){
  var objDoc = new OBJDoc('filename');
  var result = objDoc.parse(obj_file, 1, false)
  var data   = objDoc.getDrawingInfo();

  this.colors    = data.colors;
  this.indices   = data.indices;
  this.vertices  = data.vertices;
  this.normals   = data.normals;
};

var canvas = null;
var image = null;
var teapot = {
  frame: 0,
  elevation: 0,
  rotation: 0,
  animate: true,
  model: null,
  string: null
};

var gl = null;

var programs = {
  floor: null,
  teapot: null,
  shadow: null
}

var camera = new (function(){
  this.x = 0.0;
  this.y = 4.0;
  this.z = 5.0;
})();

var fbo = {
  buffer: null,
  width:  2048,
  height: 2048
};

var init = function( params ){
  canvas = document.getElementById("gl-canvas");
  gl = WebGLUtils.setupWebGL(canvas, { antialias: true });
  var EXT_STD_DERI=gl.getExtension("OES_standard_derivatives")||
                   gl.getExtension("MOZ_OES_standard_derivatives") ||
                   gl.getExtension("WEBKIT_OES_standard_derivatives");

  if (!gl) alert("WebGL isn’t available")

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.0, 0.0, 0.0, 1.0);

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LESS);

  // gl.enable(gl.CULL_FACE);
  // gl.cullFace(gl.BACK);

  programs['debug']  = initShaders( gl, "vertex-shader-debug",  "fragment-shader-debug" );
  programs['floor']  = initShaders( gl, "vertex-shader-floor",  "fragment-shader-floor" );
  programs['teapot'] = initShaders( gl, "vertex-shader-teapot", "fragment-shader-teapot" );
  programs['shadow'] = initShaders( gl, "vertex-shader-shadow", "fragment-shader-shadow" );

  setup_debug();

  setup_floor();
  setup_teapot();
  setup_light();
  setup_fbo();

  var call_render = function(){
    gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );

    update_teapot();
    update_light();

    var light_martices = render_fbo();

    render_floor({ light_martices: light_martices['floor'] });
    render_teapot({ light_martices: light_martices['teapot'] });

    if(shadow.debug_map) render_debug();

    window.requestAnimFrame(call_render);
  };
  call_render()
}

/* ========== Rendering part ========== */

/* Framebuffer object */
var setup_fbo = function(){
  var texture, depthBuffer;
  var framebuffer = gl.createFramebuffer();

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

  texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fbo['width'], fbo['height'], 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  depthBuffer = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, fbo['width'], fbo['height']);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  framebuffer.texture = texture;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);

  fbo['buffer'] = framebuffer;
};

var render_fbo = function(){
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo['buffer']);
  gl.viewport(0, 0, fbo['width'], fbo['height']);
  gl.clearColor(1.0, 0.0, 0.0, 1.0); //red -> Z=Zfar on the shadow map
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.useProgram(programs['shadow']);

  var light_matrixes_teapot = render_teapot({ shadow: true });
  var light_matrixes_floor  = render_floor({ shadow: true });

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.0, 0.0, 0.0, 1.0); //red -> Z=Zfar on the shadow map
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  return ({
    teapot: light_matrixes_teapot,
    floor:  light_matrixes_floor
  });
};

/* FLOOR */
var floor_buffers = {
  floor: {
    vertex_buffer:  null,
    vPosition_loc:  null,

    texture:        null,
    uSampler_loc:   null,
    uShadowMap_loc: null,

    texture_buffer: null,
    vTexCoord_loc:  null,

    modelViewMatrix_loc:    null,
    projectionMatrix_loc:   null,
    mvpMatrixFromLight_loc: null, // old

    viewLightMatrix_loc:       null,
    projectionLightMatrix_loc: null,

    shadow_type_loc: null,
    debug_shadow_loc: null,
    debug_vsm_shadow_loc: null,
    use_filter_loc: null
  },
  shadow: {
    vertex_buffer:  null,
    vPosition_loc:  null,

    modelViewMatrix_loc:    null,
    projectionMatrix_loc:   null,
    // mvpMatrixFromLight_loc: null, // old
  }
};

var setup_floor = function(){
  var floor_vertices = [
    vec4(-3.0, -1.0, 3.0,  1),
    vec4(3.0,  -1.0, 3.0,  1),
    vec4(3.0,  -1.0, -3.0, 1),
    vec4(-3.0, -1.0, -3.0, 1)
  ];

  /* Normal shader setup */
  gl.useProgram( programs['floor'] );
  var buffers = floor_buffers['floor'];

  buffers['vertex_buffer'] = gl.createBuffer();
  buffers['vPosition_loc'] = gl.getAttribLocation( programs['floor'], "vPosition" );
  gl.bindBuffer( gl.ARRAY_BUFFER, buffers['vertex_buffer'] );
  gl.bufferData( gl.ARRAY_BUFFER, flatten(floor_vertices), gl.STATIC_DRAW);

  buffers['uShadowMap_loc'] = gl.getUniformLocation(programs['floor'], "uShadowMap");
  buffers['uSampler_loc'] = gl.getUniformLocation(programs['floor'], "uSampler");

  gl.activeTexture(gl.TEXTURE1);
  buffers['texture'] = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, buffers['texture']);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

  // gl.generateMipmap(gl.TEXTURE_2D );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.bindTexture(gl.TEXTURE_2D, null);

  buffers['texture_buffer'] = gl.createBuffer();
  buffers['vTexCoord_loc']  = gl.getAttribLocation( programs['floor'], "vTexCoord");

  gl.bindBuffer( gl.ARRAY_BUFFER, buffers['texture_buffer']);
  gl.bufferData( gl.ARRAY_BUFFER, flatten([vec2(0, 0), vec2(1, 0), vec2(1, 1), vec2(0, 1)]), gl.STATIC_DRAW );

  buffers['modelViewMatrix_loc']    = gl.getUniformLocation( programs['floor'], "modelViewMatrix" );
  buffers['projectionMatrix_loc']   = gl.getUniformLocation( programs['floor'], "projectionMatrix" );

  buffers['mvpMatrixFromLight_loc']    = gl.getUniformLocation( programs['floor'], "mvpMatrixFromLight" ); // old
  buffers['viewLightMatrix_loc']       = gl.getUniformLocation( programs['floor'], "viewLightMatrix" );
  buffers['projectionLightMatrix_loc'] = gl.getUniformLocation( programs['floor'], "projectionLightMatrix" );

  buffers['shadow_type_loc']           = gl.getUniformLocation( programs['floor'],  "shadow_type" );
  buffers['debug_shadow_loc']          = gl.getUniformLocation( programs['floor'],  "debug_shadow" );
  buffers['debug_vsm_shadow_loc']          = gl.getUniformLocation( programs['floor'],  "debug_vsm_shadow" );
  buffers['use_filter_loc']            = gl.getUniformLocation( programs['floor'],  "use_filter" );

  /* Shadow setup */
  gl.useProgram( programs['shadow'] );
  var shadow_buffers = floor_buffers['shadow'];
  shadow_buffers['vertex_buffer'] = gl.createBuffer();
  shadow_buffers['vPosition_loc'] = gl.getAttribLocation( programs['shadow'], "vPosition" );
  gl.bindBuffer( gl.ARRAY_BUFFER, shadow_buffers['vertex_buffer'] );
  gl.bufferData( gl.ARRAY_BUFFER, flatten(floor_vertices), gl.STATIC_DRAW);
  shadow_buffers['modelViewMatrix_loc']  = gl.getUniformLocation( programs['shadow'], "modelViewMatrix" );
  shadow_buffers['projectionMatrix_loc'] = gl.getUniformLocation( programs['shadow'], "projectionMatrix" );
};

var render_floor = function( params ){
  var shadow = params && params['shadow'];
  var buffers = shadow ? floor_buffers['shadow'] : floor_buffers['floor'];

  if(shadow){
    var _camera = vec3(light.value[0], light.value[1], light.value[2]);
  } else {
    var _camera = vec3(camera.x, camera.y, camera.z);
  }

  if(!shadow) gl.useProgram(programs['floor']);

  gl.bindBuffer( gl.ARRAY_BUFFER, buffers['vertex_buffer'] );
  gl.vertexAttribPointer( buffers['vPosition_loc'], 4, gl.FLOAT, false, 0, 0 );
  gl.enableVertexAttribArray( buffers['vPosition_loc'] );

  if(!shadow){
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fbo['buffer'].texture);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, buffers['texture']);

    gl.uniform1i(buffers['uSampler_loc'], 1);
    gl.uniform1i(buffers['uShadowMap_loc'], 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers['texture_buffer']);
    gl.vertexAttribPointer(buffers['vTexCoord_loc'], 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(buffers['vTexCoord_loc']);

    gl.uniform1i(buffers['shadow_type_loc'], window.shadow.types[window.shadow.type]);
    gl.uniform1i(buffers['debug_shadow_loc'], window.shadow.debug_shadow);
    gl.uniform1i(buffers['debug_vsm_shadow_loc'], window.shadow.debug_vsm_shadow);
    gl.uniform1i(buffers['use_filter_loc'], window.shadow.use_filter);
  }

  /* moving it a little bit */
  var transform = mat4();

  /* rotation */
  transform = rotate(3*teapot['rotation'], [1,1,1]);

  var look_at_matrix = lookAt(_camera, look_at, vec3(0.0, 1.0, 0.0));
  var modelViewMatrix = mult(look_at_matrix, transform);

  if(shadow){
    var projectionMatrix = light_projection_martix;
  } else {
    var projectionMatrix = camera_perspective_matrix;
  }

  gl.uniformMatrix4fv(buffers['modelViewMatrix_loc'],  false, flatten(modelViewMatrix));
  gl.uniformMatrix4fv(buffers['projectionMatrix_loc'], false, flatten(projectionMatrix));

  if(params['light_martices']){
    gl.uniformMatrix4fv(buffers['viewLightMatrix_loc'], false, flatten(params['light_martices'][0]));
    gl.uniformMatrix4fv(buffers['projectionLightMatrix_loc'], false, flatten(params['light_martices'][1]));
  }

  gl.drawArrays( gl.TRIANGLE_FAN, 0, 4 );
  return [modelViewMatrix, projectionMatrix];
};

/* TEAPOT */
var teapot_buffers = {
  teapot: {
    vertex_buffer:        null,
    indices_buffer:       null,
    normals_buffer:       null,

    modelViewMatrix_loc:  null,
    projectionMatrix_loc: null,
    normalMatrix_loc:     null,
  },
  shadow: {
    vertex_buffer:        null,
    indices_buffer:       null,
    normals_buffer:       null,

    modelViewMatrix_loc:  null,
    projectionMatrix_loc: null,
    normalMatrix_loc:     null,
  }
};

var setup_teapot = function(){
  teapot['model'] = new Model(teapot['string']);

  ['teapot', 'shadow'].forEach(function(key){
    var buffers = teapot_buffers[key];

    gl.useProgram( programs[key] );

    /* vertex positions */
    buffers['vertex_buffer'] = gl.createBuffer();
    buffers['vPosition_loc'] = gl.getAttribLocation( programs[key], "vPosition" );
    gl.bindBuffer( gl.ARRAY_BUFFER, buffers['vertex_buffer'] );
    gl.bufferData( gl.ARRAY_BUFFER, flatten(teapot['model'].vertices), gl.STATIC_DRAW);

    /* indices */
    buffers['indices_buffer'] = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers['indices_buffer']);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, teapot['model'].indices, gl.STATIC_DRAW);

    /* normals */
    buffers['normals_buffer'] = gl.createBuffer();
    buffers['vNormal_loc'] = gl.getAttribLocation( programs[key], "vNormal" );
    gl.bindBuffer( gl.ARRAY_BUFFER, buffers['normals_buffer'] );
    gl.bufferData( gl.ARRAY_BUFFER, teapot['model'].normals, gl.STATIC_DRAW);

    /* matrixes */
    buffers['modelViewMatrix_loc']  = gl.getUniformLocation( programs[key], "modelViewMatrix" );
    buffers['projectionMatrix_loc'] = gl.getUniformLocation( programs[key], "projectionMatrix" );
    buffers['normalMatrix_loc']     = gl.getUniformLocation( programs[key], "normalMatrix" );
  });
};

var render_teapot = function( params ){
  var shadow = params && params['shadow'];
  var buffers = shadow ? teapot_buffers['shadow'] : teapot_buffers['teapot'];
  var _camera = shadow ? vec3(light.value[0], light.value[1], light.value[2]) : vec3(camera.x, camera.y, camera.z);

  if(!shadow) gl.useProgram(programs['teapot']);

  /* vertex positions */
  gl.bindBuffer( gl.ARRAY_BUFFER, buffers['vertex_buffer'] );
  gl.vertexAttribPointer( buffers['vPosition_loc'], 3, gl.FLOAT, false, 0, 0 );
  gl.enableVertexAttribArray( buffers['vPosition_loc'] );

  /* normals */
  if(!shadow){
    gl.bindBuffer( gl.ARRAY_BUFFER, buffers['normals_buffer'] );
    gl.vertexAttribPointer( buffers['vNormal_loc'], 3, gl.FLOAT, false, 0, 0 );
    gl.enableVertexAttribArray( buffers['vNormal_loc'] );
  }

  gl.disable(gl.CULL_FACE);

  if(shadow){
    var projectionMatrix = light_projection_martix;
  } else {
    var projectionMatrix = camera_perspective_matrix;
  }

  /* matrices */
  var transform = mat4();

  /* rotation */
  transform = rotate(3*teapot['rotation'], [1,1,1]);

  /* scale */            /* moving */
  transform[0][0] = 1/4; transform[0][3] = 0;
  transform[1][1] = 1/4; transform[1][3] = teapot['elevation'];
  transform[2][2] = 1/4; transform[2][3] = 0;

  var look_at_martrix = lookAt(_camera, look_at, vec3(0.0, 1.0, 0.0));
  var modelViewMatrix = mult(look_at_martrix, transform);

  var normalMatrix = [
    vec3(modelViewMatrix[0][0], modelViewMatrix[0][1], modelViewMatrix[0][2]),
    vec3(modelViewMatrix[1][0], modelViewMatrix[1][1], modelViewMatrix[1][2]),
    vec3(modelViewMatrix[2][0], modelViewMatrix[2][1], modelViewMatrix[2][2])
  ];

  gl.uniformMatrix4fv(buffers['modelViewMatrix_loc'],  false, flatten(modelViewMatrix));
  gl.uniformMatrix4fv(buffers['projectionMatrix_loc'], false, flatten(projectionMatrix));
  gl.uniformMatrix3fv(buffers['normalMatrix_loc'],     false, flatten(normalMatrix));

  if(params['matrices']){
    gl.uniformMatrix4fv(buffers['viewLightMatrix_loc'], false, flatten(params['matrices'][0]));
    gl.uniformMatrix4fv(buffers['projectionLightMatrix_loc'], false, flatten(params['matrices'][1]));
  }

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers['indices_buffer']);
  gl.drawElements( gl.TRIANGLES, teapot['model'].indices.length, gl.UNSIGNED_SHORT, 0);

  if(shadow){
    gl.drawElements( gl.TRIANGLES, teapot['model'].indices.length, gl.UNSIGNED_SHORT, 0);
  }

  return [look_at_martrix, modelViewMatrix];
};

var update_teapot = function(){
  if(teapot['animate']){
    teapot['frame'] += 0.03;
    teapot['elevation'] = Math.sin(teapot['frame'])
    teapot['rotation'] = Math.cos(teapot['frame'])
  }
};

var setup_light = function(){
  light['loc'] = gl.getUniformLocation( programs['teapot'], "lightPosition" );
};

var update_light = function(){
  gl.useProgram(programs['teapot']);

  if(light['animate']){
    light['angle'] += 0.01;

    if(light['angle'] > 2*Math.PI) light['angle'] -= 2*Math.PI;

    light['value'][0] = 2*Math.sin(light['angle']);
    light['value'][2] = 2*Math.cos(light['angle']);
  }

  gl.uniform3fv( light['loc'], light['value']);
};

var load_texture = function(callback){
  image = document.createElement('img');
  image.src = 'wood.png';
  image.onload = callback;
};

var load_teapot = function(callback){
   var xhr = new XMLHttpRequest();
   xhr.onreadystatechange = function() {
      if (xhr.readyState == XMLHttpRequest.DONE) {
        teapot['string'] = xhr.responseText;
        callback();
      }
  }
  xhr.open('GET', 'teapot.obj', true);
  xhr.send(null);
};

var init_dat = function(){
  var gui = new dat.GUI();
  var mvm = gui.addFolder("Camera");
  mvm.add(camera, 'y', 0, 10).step(0.1).listen();
  mvm.add(camera, 'x', 0, 10).step(0.1).listen();
  mvm.add(camera, 'z', 0.1, 10).step(0.1).listen();
  var shd = gui.addFolder("Shadow");

  shd.add(shadow, 'debug_map');
  shd.add(shadow, 'debug_shadow');
  shd.add(shadow, 'debug_vsm_shadow');
  shd.add(shadow, 'use_filter');
  shd.add(shadow, 'type', ['shadow_mapping', 'shadow_mapping+pcf', 'vsm']);
  shd.add(shadow, 'ortho_size', 1, 100).listen().onChange(shadow.set_ortho_size);

  var lgs = gui.addFolder("Lights");
  lgs.add(light, 'animate').listen();
  var mdl = gui.addFolder("Model");
  mdl.add(teapot, 'animate').listen();
  mdl.open();
  shd.open();
  mvm.open();
  lgs.open();
}

window.onload = function(){
  load_texture(function(){
    load_teapot(function(){
      init();
      init_dat();
    });
  });
}
