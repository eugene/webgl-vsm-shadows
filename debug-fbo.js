/* FLOOR */
var debug_buffers = {
  debug: {
    vertex_buffer:  null,
    vPosition_loc:  null,

    texture:        null,
    uSampler_loc:   null,
    uShadowMap_loc: null,

    texture_buffer: null,
    vTexCoord_loc:  null,

    modelViewMatrix_loc:    null,
    projectionMatrix_loc:   null,
    mvpMatrixFromLight_loc: null
  }
};

var setup_debug = function(){
  var vertices = [
    vec4( -0.75,  0.75,   0.0,  1),
    vec4( -0.75,  -0.75,  0.0,  1),
    vec4(  0.75,  -0.75,  0.0,  1),
    vec4(  0.75, 0.75,    0.0,  1)
  ];

  /* Normal shader setup */
  gl.useProgram( programs['debug'] );
  var buffers = debug_buffers['debug'];

  buffers['vertex_buffer'] = gl.createBuffer();
  buffers['vPosition_loc'] = gl.getAttribLocation( programs['debug'], "vPosition" );
  gl.bindBuffer( gl.ARRAY_BUFFER, buffers['vertex_buffer'] );
  gl.bufferData( gl.ARRAY_BUFFER, flatten(vertices), gl.STATIC_DRAW);

  buffers['uSampler_loc'] = gl.getUniformLocation(programs['debug'], "uSampler");

  buffers['texture_buffer'] = gl.createBuffer();
  buffers['vTexCoord_loc']  = gl.getAttribLocation( programs['floor'], "vTexCoord");

  gl.bindBuffer( gl.ARRAY_BUFFER, buffers['texture_buffer']);
  gl.bufferData( gl.ARRAY_BUFFER, flatten([vec2(1, 1), vec2(1, 0), vec2(0, 0), vec2(0, 1)]), gl.STATIC_DRAW );
};

var render_debug = function( params ){
  var buffers = debug_buffers['debug'];
  var _camera = vec3(camera.x, camera.y, camera.z);

  gl.useProgram(programs['debug']);

  gl.bindBuffer( gl.ARRAY_BUFFER, buffers['vertex_buffer'] );
  gl.vertexAttribPointer( buffers['vPosition_loc'], 4, gl.FLOAT, false, 0, 0 );
  gl.enableVertexAttribArray( buffers['vPosition_loc'] );

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, fbo['buffer'].texture);

  gl.bindBuffer(gl.ARRAY_BUFFER, buffers['texture_buffer']);
  gl.vertexAttribPointer(buffers['vTexCoord_loc'], 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(buffers['vTexCoord_loc']);

  gl.drawArrays( gl.TRIANGLE_FAN, 0, 4 );
};
