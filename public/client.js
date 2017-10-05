var canvas = document.getElementById('gameCanvas');
var ctx = canvas.getContext('2d');

var socket = io.connect('localhost:3000');

//Start mainLoop
init();

function init(){
  socket.emit('join');
  requestAnimationFrame(mainLoop);
}

//////////////////////////////////////////////////////////////////////
var lastFrameTimeMs = 0;
var maxFPS = 60;
var delta = 0;
var timestep = 1000 / 60; //Frame length

var x = 0;
var y = 0;

var time;
var oldtime;

var id;
//////////////////////////////////////////////////////////////////////
var playerMetaList = [];
var entityList = [];

var screenX;
var screenY;

var screenWidth = 640;
var screenHeight = 640;

/////////////////////////////////////////////////////////////////////
var renderX;
var renderY;

/////////////////////////////////////////////////////////////////////
//TEMPORARY VARIABLES FOR PROTOTYPING ONLY
var mouseDown = false;

/////////////////////////////////////////////////////////////////////

var data = {
  id: socket.id,
  mouseX: screen.width/2,
  mouseY: screen.height/2,
  x: x,
  y: y,
  clickFlag: false,
  spaceFlag: false
}

addEventListener('mousemove', function(event){
    //Server
    //Only update if distance is large enough

    data.mouseX = event.clientX;
    data.mouseY = event.clientY;

    //Local
});

addEventListener('click', function(event){
  //Server
  data.clickFlag = true;
  //Local
});

//Only for local (Graphical) use
addEventListener('mousedown', function(event){
  //Local
  mouseDown = true;
});
addEventListener('mouseup', function(event){
  //Local
  mouseDown = false;
});

addEventListener('keyup', function(event){
  data.spaceFlag = false;
});

addEventListener('keydown', function(event){
  data.spaceFlag = true;
});

addEventListener('resize', function(event){
  //Not accurate - not actually innerHeight includes scrollbar
  screenWidth = window.innerWidth;
  screenHeight = window.innerHeight;

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  socket.emit('resize', {viewportWidth: window.innerWidth, viewportHeight: window.innerHeight});
});

function sendData(delta) {
  socket.emit('data', data);

  //Reset any flags
  data.clickFlag = false;
}

function getData(){

}

socket.on('init', function(data){
  id = data.id
});

//Authoritative - But in the meantime, interpolate during update loop
socket.on('data',
  function(data){

    playerMetaList = [];
    entityList = [];

    for(var i = 0; i < data.snapshot.length; i++){
      for(var j = 0; j < Object.keys(data.snapshot[i].players).length; j++){

        var currentID = Object.keys(data.snapshot[i].players)[j];
        var currentPlayer = data.snapshot[i].players[currentID];

        if(currentID == id){
          x = data.snapshot[i].players[currentID].x;
          y = data.snapshot[i].players[currentID].y;
        }
        playerMetaList.push(currentPlayer);
      }

      for(var j = 0; j < Object.keys(data.snapshot[i].entities).length; j++){
        var currentID = Object.keys(data.snapshot[i].entities)[j];
        var currentEntity = data.snapshot[i].entities[currentID];

        entityList.push(currentEntity);
      }
    }
  }
);

function update(delta) {
  //Calculate where top-left player screen is in world
  screenX = x - screenWidth/2;
  screenY = y - screenHeight/2;

  //Find relative positions
  /*for(var i = 0; i < playerMetaList.length; i++){
    playerMetaList[i].x -= screenX;
    playerMetaList[i].y -= screenY;
  }*/

}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  var gridSize = 128;

  var xOffset = -screenX % gridSize;
  var yOffset = -screenY % gridSize;

  //Grid lines
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#777777';

  //Vertical lines
  for (xOffset; xOffset < canvas.width; xOffset += gridSize) {

    ctx.moveTo(xOffset,0);
    ctx.lineTo(xOffset, canvas.height);
    ctx.stroke();
  }

  //Horizontal lines
  for (yOffset; yOffset < canvas.height; yOffset += gridSize) {
    ctx.lineWidth = 1;
    ctx.moveTo(0,yOffset);
    ctx.lineTo(canvas.width, yOffset);

    ctx.stroke();
  }

  ctx.fillStyle = "#9b59b6";
  //Entities

  for(var i = 0; i < entityList.length; i++){
    ctx.beginPath();
    ctx.arc(entityList[i].x - screenX, entityList[i].y - screenY, 20, 0, 2 * Math.PI);
    ctx.fill();
  }

  //TEMPORARY CIRCLE - Space Arc
  ctx.strokeStyle = "#bdc3c7";
  ctx.fillStyle = "#7f8c8d";
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(x - screenX, y - screenY, 300, 0, 2 * Math.PI);

  if(data.spaceFlag){
    ctx.globalAlpha = 0.5
    ctx.fill();
  }
  else{
    ctx.stroke();
  }

  var mouseAngle = Math.atan2(data.mouseY - screenHeight/2, data.mouseX - screenWidth/2);

  //TEMPORARY ARC - Click Arc
  ctx.strokeStyle = "#bdc3c7";
  ctx.fillStyle = "#95a5a6";
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(x - screenX, y - screenY);
  ctx.arc(x - screenX , y - screenY, 250, mouseAngle - Math.PI/4, mouseAngle + Math.PI/4);
  ctx.lineTo(x - screenX, y - screenY);

  if(mouseDown){
      console.log(21321);
    ctx.globalAlpha = 0.5
    ctx.fill();
  }
  else{
    ctx.stroke();
  }

  ctx.lineWidth = 5;
  ctx.strokeStyle = "#16a085";
  ctx.fillStyle = "#1abc9c";
  ctx.globalAlpha = 1;
  
  //Players
  for(var i = 0; i < playerMetaList.length; i++){
    ctx.beginPath();
    ctx.arc(playerMetaList[i].x - screenX, playerMetaList[i].y - screenY, playerMetaList[i].radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }
}

function mainLoop(timestamp) {

    //If the time for the next frame(timestep) update hasn't been reached, end the function
    if (timestamp < lastFrameTimeMs + (1000 / maxFPS)) {
        requestAnimationFrame(mainLoop);
        return;
    }
    //Takes into account residual delta from lastFrameTime - (Basically keep adding to delta until delta is larger than the timestep, then proceed to while loop)
    delta += timestamp - lastFrameTimeMs;
    lastFrameTimeMs = timestamp;

    var numUpdateSteps = 0;
    //Where updates actually occur
    //Iterate through updates in chunks equal to the timestep until caught up with delta
    while (delta >= timestep) {
        sendData(timestep);

        update(timestep);

        delta -= timestep;

        //In case of too many updates causing "spiral of death", May need adjusting
        if (++numUpdateSteps >= 240) {
            panic();
            break;
        }

    }
    render();

    //var start = window.performance.now()
    //console.log("Execution time:    " + (window.performance.now() - start))
    /*
    check for user input
        send commands to the server
        receive updates about the game from the server
        draw graphics
        play sounds
    */
    requestAnimationFrame(mainLoop);
}

function panic() {
    delta = 0;
    //Get authoritative data to update position
}
