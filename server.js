console.log('Force.io Server Started');

var express = require('express');
var app = express();
var server = app.listen(3000);
app.use(express.static('public'));
var socket = require('socket.io');
var io = socket(server);

///////////////////////////////////////////
//World Variables
var chunkSize = 640;
var worldSize = 6400;
var maxChunks = worldSize/chunkSize;

///////////////////////////////////////////
//Update Variables
var lastFrameTimeMs = 0;
var maxFPS = 60;
var delta = 0;
var timestep = 1000 / maxFPS; //Frame length
var timestamp;

var friction = 0.98;
var speed = 0.005;
var chunkUpdatesPerSecond = 60;
///////////////////////////////////////////
var entityRadius = 20;


///////////////////////////////////////////
var playerList = {};
var playerMetaList = {};
var playerServerMetaList = {};

var chunkDataGrid = [];

var entityList = {};

///////////////////////////////////////////

init();

function init(){

  //World Generation
  for(var i = 0; i < worldSize/chunkSize; i++){
    chunkDataGrid.push(new Array());
    for(var j = 0; j < worldSize/chunkSize; j++){
        chunkDataGrid[i].push(new chunkData(i, j));
    }
  }

  for(var i = 0; i < 100; i++){
    var spawnX = Math.random()*worldSize;
    var spawnY = Math.random()*worldSize;
    var ball = new Ball(spawnX, spawnY, getChunk(spawnX), getChunk(spawnY));
    chunkDataGrid[getChunk(spawnX)][getChunk(spawnY)].entities[i] = ball;
    entityList[i] = ball;
  }
  //Start GameLoop
  setImmediate(mainLoop);
}

function update(delta) {

  var directionX;
  var directionY;
  var distance;
  var startX;
  var startY;
  var endX;
  var endY;

  for(var i = 0; i < Object.keys(playerServerMetaList).length; i++){
    //Delta has a different meaning here than in the mainLoop
    var currentID = Object.keys(playerServerMetaList)[i];

    startX = playerServerMetaList[currentID].viewportWidth/2;
    startY = playerServerMetaList[currentID].viewportHeight/2;
    endX = playerServerMetaList[currentID].mouseX;
    endY = playerServerMetaList[currentID].mouseY;

    distance = Math.sqrt(Math.pow(endX - startX,2) + Math.pow(endY - startY,2));

    //For values less than the speed traveled in one frame
    if(distance < speed * delta){
      playerMetaList[currentID].x = playerServerMetaList[currentID].mouseX;
      playerMetaList[currentID].y = playerServerMetaList[currentID].mouseY;
      continue;
    }

    //Direction 'vector' from 0 - 1
    directionX = (endX-startX) / distance;
    directionY = (endY-startY) / distance;

    playerServerMetaList[currentID].xSpeed += directionX * speed * delta;
    playerServerMetaList[currentID].ySpeed += directionY * speed * delta;

    playerServerMetaList[currentID].xSpeed *= friction;
    playerServerMetaList[currentID].ySpeed *= friction;

    playerMetaList[currentID].x += playerServerMetaList[currentID].xSpeed;
    playerMetaList[currentID].y += playerServerMetaList[currentID].ySpeed;

    //TEMPORARY BOUNDARIES
    if(playerMetaList[currentID].x >= worldSize){
      playerMetaList[currentID].x = worldSize - 1;
    }
    else if(playerMetaList[currentID].x < 0){
      playerMetaList[currentID].x = 0;
    }
    if(playerMetaList[currentID].y >= worldSize){
      playerMetaList[currentID].y = worldSize - 1;
    }
    else if(playerMetaList[currentID].y < 0){
      playerMetaList[currentID].y = 0;
    }


  }

  //Movement
  for(var i = 0; i < Object.keys(entityList).length; i++){

    var currentEntity = entityList[Object.keys(entityList)[i]];

    if(currentEntity.xSpeed == 0 && currentEntity.ySpeed == 0){
      continue;
    }

    currentEntity.xSpeed *= friction;
    currentEntity.ySpeed *= friction;

    currentEntity.x += currentEntity.xSpeed;
    currentEntity.y += currentEntity.ySpeed;

    if(currentEntity.x >= worldSize){
      currentEntity.x = worldSize - 1;
    }
    else if(currentEntity.x < 0){
      currentEntity.x = 0;
    }
    if(currentEntity.y >= worldSize){
      currentEntity.y = worldSize - 1;
    }
    else if(currentEntity.y < 0){
      currentEntity.y = 0;
    }
  }

  checkCollisions();
}

function panic() {
    delta = 0;
    //Use authoritative state to fix player position
}

function mainLoop() {
    timestamp = Date.now();

    //If the time for the next frame(timestep) update hasn't been reached, end the function
    if (timestamp < lastFrameTimeMs + (1000 / maxFPS)) {
        setImmediate(mainLoop);
        return;
    }
    //Takes into account residual delta from lastFrameTime - (Basically keep adding to delta until delta is larger than the timestep, then proceed to while loop)
    delta += timestamp - lastFrameTimeMs;
    lastFrameTimeMs = timestamp;

    var numUpdateSteps = 0;

    //Where updates actually occur
    //Iterate through updates in chunks equal to the timestep until caught up with delta
    while (delta >= timestep) {
        update(timestep);
        delta -= timestep;

        //In case of too many updates causing "spiral of death" $x overload, May need adjusting
        if (++numUpdateSteps >= 240) {
            panic();
            break;
        }
    }

    for(var i = 0; i < Object.keys(entityList).length; i++){

      var currentID = Object.keys(entityList)[i];
      var currentEntity = entityList[Object.keys(entityList)[i]];

      //Get new chunk positions/visible chunks if moved into a new chunk
      if(currentEntity.chunkX != getChunk(currentEntity.x) || currentEntity.chunkY != getChunk(currentEntity.y)){
        //Remove from previous chunk
        //console.log(chunkDataGrid[playerMetaList[currentID].chunkX][playerMetaList[currentID]])
        delete chunkDataGrid[currentEntity.chunkX][currentEntity.chunkY].entities[i];

        currentEntity.chunkX = getChunk(currentEntity.x);
        currentEntity.chunkY = getChunk(currentEntity.y);

        //console.log(entityList[i].chunkX + "     " + entityList[i].chunkY)

        chunkDataGrid[currentEntity.chunkX][currentEntity.chunkY].entities[currentID] = currentEntity;
      }
    }
    //IN THIS LOOP DATA IS PROCESSED FOR EACH PLAYER AND SENT
    //Chunk calculations - left outside update loop because this is only important for client rendering
    for(var i = 0; i < Object.keys(playerServerMetaList).length; i++){

      var currentID = Object.keys(playerServerMetaList)[i];

      //Get new chunk positions/visible chunks if moved into a new chunk
      if(playerMetaList[currentID].chunkX != getChunk(playerMetaList[currentID].x) || playerMetaList[currentID].chunkY != getChunk(playerMetaList[currentID].y)){
        //Remove from previous chunk
        //console.log(chunkDataGrid[playerMetaList[currentID].chunkX][playerMetaList[currentID]])
        delete chunkDataGrid[playerMetaList[currentID].chunkX][playerMetaList[currentID].chunkY].players[currentID];

        playerMetaList[currentID].chunkX = getChunk(playerMetaList[currentID].x);
        playerMetaList[currentID].chunkY = getChunk(playerMetaList[currentID].y);

        //console.log(playerMetaList[currentID].chunkX + "        " + playerMetaList[currentID].chunkY);
        //console.log(chunkDataGrid[playerMetaList[currentID].chunkX][playerMetaList[currentID].chunkY])
        chunkDataGrid[playerMetaList[currentID].chunkX][playerMetaList[currentID].chunkY].players[currentID] = playerMetaList[currentID];

        //Get new visible chunks
        playerServerMetaList[currentID].chunksVisible = getVisibleChunks(playerMetaList[currentID].chunkX, playerMetaList[currentID].chunkY, playerList[currentID].chunksModifierX, playerList[currentID].chunksModifierY);

        //console.log(playerList[currentID].chunkX + "        " + playerList[currentID].chunkY);
        //console.log(playerList[currentID].chunksVisible);
      }


      //ON CLICK TEMPORARY
      if(playerServerMetaList[currentID].clickFlag){
        console.log("clicked" + "     " + currentID);

        var mouseAngle = Math.atan2(playerServerMetaList[currentID].mouseY - playerServerMetaList[currentID].viewportHeight/2, playerServerMetaList[currentID].mouseX - playerServerMetaList[currentID].viewportWidth/2);

        for(var j = 0; j < playerServerMetaList[currentID].chunksVisible.length; j++){
          //PLAYERS
          for(var k = 0; k < Object.keys(playerServerMetaList[currentID].chunksVisible[j].players).length; k++){

            var otherID = Object.keys(playerServerMetaList[currentID].chunksVisible[j].players)[k];

            if(currentID == otherID){
              continue;
            }

            var squareDistance = Math.pow(playerMetaList[currentID].x - playerMetaList[otherID].x, 2) + Math.pow(playerMetaList[currentID].y - playerMetaList[otherID].y, 2);
            var angleDifference = Math.atan2(playerMetaList[otherID].y - playerMetaList[currentID].y, playerMetaList[otherID].x - playerMetaList[currentID].x);

            //Find players within distance and radius
            if(squareDistance < 62500){
              console.log("in range")
              var start = mouseAngle - Math.PI/4;

              if(start < -Math.PI){
                start += 2 * Math.PI;
              }
              if(angleDifference < start){
                  angleDifference += 2 * Math.PI;
              }
              //IN SECTOR
              if(angleDifference <= start + Math.PI/2){
                console.log("in angle bounds");

                directionX = (playerMetaList[otherID].x - playerMetaList[currentID].x) / Math.sqrt(squareDistance);;
                directionY = (playerMetaList[otherID].y - playerMetaList[currentID].y) / Math.sqrt(squareDistance);;

                playerServerMetaList[otherID].xSpeed += directionX * 17;
                playerServerMetaList[otherID].ySpeed += directionY * 17;
              }
            }
          }
          //ENTITIES
          for(var k = 0; k < Object.keys(playerServerMetaList[currentID].chunksVisible[j].entities).length; k++){
            var otherEntity = entityList[Object.keys(playerServerMetaList[currentID].chunksVisible[j].entities)[k]];

            var squareDistance = Math.pow(playerMetaList[currentID].x - otherEntity.x, 2) + Math.pow(playerMetaList[currentID].y - otherEntity.y, 2);
            var angleDifference = Math.atan2(otherEntity.y - playerMetaList[currentID].y, otherEntity.x - playerMetaList[currentID].x);

            //Find players within distance and radius
            if(squareDistance < 62500){
              console.log("in range")
              var start = mouseAngle - Math.PI/4;

              if(start < -Math.PI){
                start += 2 * Math.PI;
              }
              if(angleDifference < start){
                  angleDifference += 2 * Math.PI;
              }
              //IN SECTOR
              if(angleDifference <= start + Math.PI/2){
                console.log("in angle bounds");

                directionX = (otherEntity.x - playerMetaList[currentID].x) / Math.sqrt(squareDistance);
                directionY = (otherEntity.y - playerMetaList[currentID].y) / Math.sqrt(squareDistance);

                otherEntity.xSpeed += directionX * 20;
                otherEntity.ySpeed += directionY * 20;
              }
            }
          }
        }
      }

      //ON SPACE TEMPORARY
      if(playerServerMetaList[currentID].spaceFlag){
        for(var j = 0; j < playerServerMetaList[currentID].chunksVisible.length; j++){
          //ENTITIES
          for(var k = 0; k < Object.keys(playerServerMetaList[currentID].chunksVisible[j].entities).length; k++){
            var otherEntity = entityList[Object.keys(playerServerMetaList[currentID].chunksVisible[j].entities)[k]];

            var squareDistance = Math.pow(playerMetaList[currentID].x - otherEntity.x, 2) + Math.pow(playerMetaList[currentID].y - otherEntity.y, 2);

            if(squareDistance < 90000){
              directionX = (playerMetaList[currentID].x - otherEntity.x) / Math.sqrt(squareDistance);
              directionY = (playerMetaList[currentID].y - otherEntity.y) / Math.sqrt(squareDistance);

              otherEntity.xSpeed += directionX * 0.1;
              otherEntity.ySpeed += directionY * 0.1;
            }
          }

          //PLAYERS
          for(var k = 0; k < Object.keys(playerServerMetaList[currentID].chunksVisible[j].players).length; k++){
            var otherID = Object.keys(playerServerMetaList[currentID].chunksVisible[j].players)[k];
            if(currentID == otherID){
              continue;
            }

            var squareDistance = Math.pow(playerMetaList[currentID].x - playerMetaList[otherID].x, 2) + Math.pow(playerMetaList[currentID].y - playerMetaList[otherID].y, 2);

            if(squareDistance < 90000){
              directionX = (playerMetaList[currentID].x - playerMetaList[otherID].x) / Math.sqrt(squareDistance);
              directionY = (playerMetaList[currentID].y - playerMetaList[otherID].y) / Math.sqrt(squareDistance);

              playerServerMetaList[otherID].xSpeed += directionX * 0.2;
              playerServerMetaList[otherID].ySpeed += directionY * 0.2;

              console.log(playerServerMetaList[otherID].xSpeed + "         " + playerServerMetaList[otherID].ySpeed);
            }
          }


        }
      }

      //Send data to clients - only send after all updates have caught up
      io.sockets.in(Object.keys(playerMetaList)[i]).emit('data', {snapshot: playerServerMetaList[currentID].chunksVisible, player: playerList[currentID]});

    }
    /*
    check for client commands - get input
    calculate new positions and chunks
    calculate chunks to send each player

       (run AI)
       move all entities
       resolve collisions
       send updates about the game to the clients
    */
    setImmediate(mainLoop);
}


//Player Object
function Player(id){
  this.id = id;

  this.chunksModifierX = 1;
  this.chunksModifierY = 1;
}

function PlayerMeta(x, y){
  this.x = x;
  this.y = y;
  this.chunkX = getChunk(x);
  this.chunkY = getChunk(y);

  //Starting radius
  this.radius = 35;
}

function PlayerServerMeta(){
  this.mouseX = 0;
  this.mouseY = 0;
  this.chunksVisible = [];
  //Not accurate - not actually innerHeight includes scrollbar
  this.viewportWidth = 640;
  this.viewportHeight = 640;

  this.xSpeed = 0;
  this.ySpeed = 0;

  this.mouseAngle = 0;

  this.range = 2500;
  this.arc = Math.PI/2;
  this.speed = 50;
  this.clickFlag = false;
  this.spaceFlag = false;
}

function chunkData(chunkX, chunkY){
  this.chunkX = chunkX;
  this.chunkY = chunkY;
  this.players = {};
  this.entities = {};
}

function Ball(x, y, chunkX, chunkY){
  this.x = x;
  this.y = y;
  this.xSpeed = 0;
  this.ySpeed = 0;
  this.chunkX = 0;
  this.chunkY = 0;
}


//Socket Events
io.sockets.on('connection', function(socket){
  //TEMP
  var spawnX = 630;
  var spawnY = 630;

  var player = new Player(socket.id);
  var playerMeta = new PlayerMeta(spawnX, spawnY);
  var playerServerMeta = new PlayerServerMeta();

  playerList[socket.id] = player;
  playerMetaList[socket.id] = playerMeta;

  playerServerMetaList[socket.id] = playerServerMeta;


  chunkDataGrid[getChunk(spawnX)][getChunk(spawnY)].players[socket.id] = playerMeta;

  playerServerMeta.chunksVisible = getVisibleChunks(getChunk(spawnX), getChunk(spawnY), player.viewportWidth, player.viewportHeight);


  socket.on('join', function (){
    console.log('User joined with ID:   ' + socket.id);

    socket.join(socket.id);

    //Send any Server Initialisation data includind ID
    io.sockets.in(socket.id).emit('init', {id: socket.id});
  });

  //Retrieve data from client and update
  socket.on('data', function(data){
    playerServerMetaList[socket.id].mouseX = data.mouseX;
    playerServerMetaList[socket.id].mouseY = data.mouseY;
    playerServerMetaList[socket.id].clickFlag = data.clickFlag;
    playerServerMetaList[socket.id].spaceFlag = data.spaceFlag;

  });

  socket.on('resize', function(data){
    playerServerMetaList[socket.id].viewportWidth = data.viewportWidth;
    playerServerMetaList[socket.id].viewportHeight = data.viewportHeight;

    //Update chunks
    playerList[socket.id].chunkModiferX = getChunkModifier(data.viewportWidth);
    playerList[socket.id].chunkModiferY = getChunkModifier(data.viewportHeight);
    //playerList[socket.id].chunksVisible = getVisibleChunks(playerList[socket.id].chunkX, playerList[socket.id].chunkY, playerList[socket.id].chunkModiferX, playerList[socket.id].chunkModiferY);
  });

});

//Collision Detection only within neighbouring cells
function checkCollisions(){
    for(var i = 0; i < Object.keys(playerServerMetaList).length; i++){
      var currentID = Object.keys(playerServerMetaList)[i];
      for(var j = 0; j < playerServerMetaList[currentID].chunksVisible.length; j++){

        //PLAYERS
        for(var k = 0; k < Object.keys(playerServerMetaList[currentID].chunksVisible[j].players).length; k++){

          var otherID = Object.keys(playerServerMetaList[currentID].chunksVisible[j].players)[k];

          if(currentID == otherID){
            continue;
          }

          var squareDistance = Math.pow(playerMetaList[currentID].x - playerMetaList[otherID].x, 2) + Math.pow(playerMetaList[currentID].y - playerMetaList[otherID].y, 2);
          var squareTouchDistance = Math.pow(playerMetaList[currentID].radius + 10, 2) + Math.pow(playerMetaList[otherID].radius + 10, 2);;
          //Collision
          if(squareDistance <= squareTouchDistance){
            directionX = (playerMetaList[otherID].x - playerMetaList[currentID].x) / Math.sqrt(squareDistance);
            directionY = (playerMetaList[otherID].y - playerMetaList[currentID].y) / Math.sqrt(squareDistance);

            playerServerMetaList[otherID].xSpeed += directionX * 2;
            playerServerMetaList[otherID].ySpeed += directionY * 2;
          }
        }

        //ENTITIES
        for(var k = 0; k < Object.keys(playerServerMetaList[currentID].chunksVisible[j].entities).length; k++){
          var otherEntity = entityList[Object.keys(playerServerMetaList[currentID].chunksVisible[j].entities)[k]];

          var squareDistance = Math.pow(playerMetaList[currentID].x - otherEntity.x, 2) + Math.pow(playerMetaList[currentID].y - otherEntity.y, 2);



          //Collision
          if(squareDistance < playerMetaList[currentID].radius + entityRadius){
             /*
            directionX = (playerMetaList[currentID].x - otherEntity.x) / Math.sqrt(squareDistance);
            directionY = (playerMetaList[currentID].y - otherEntity.y) / Math.sqrt(squareDistance);

            otherEntity.xSpeed += directionX * 0.1;
            otherEntity.ySpeed += directionY * 0.1;
            */
          }
        }
      }
    }
}




//Calculate chunks to render for the player depending on their screenSize - Must be authoritative to avoid scaling game and seeing too much
//Calculated to show enough on screen before next chunk update - speed * delta ~ 800px/s
//2 Players meet twice as fast - speed * 1000 * 2 /FPS + leeway excess chunks - since chunk updates happen each second
function getChunkModifier(length){
  //bufferDistance = maximum relative speed traveled between chunk updates + leeway
  var bufferDistance = speed * 1000 * 2 / chunkUpdatesPerSecond + 20;
  var chunkModifier = Math.ceil(((length - chunkSize)/2 + bufferDistance)/chunkSize);

  return chunkModifier;
}


function getVisibleChunks(chunkX, chunkY, chunksModifierX, chunksModifierY){
  var dataChunks = [];

  for(var i = -chunksModifierX; i <= chunksModifierX; i++){
    for(var j = -chunksModifierY; j <= chunksModifierY; j++){
      if(chunkX + i >= 0 && chunkX + i < maxChunks && chunkY + j >= 0 && chunkY + j < maxChunks){
        dataChunks.push(chunkDataGrid[chunkX + i][chunkY + j]);
      }
    }
  }
  return dataChunks;
}

function getChunk(value){
  return Math.floor(value/chunkSize);
}
