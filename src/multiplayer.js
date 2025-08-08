/**
	bwapi - Blocksworld API server reimplementation
    Copyright (C) 2020 zenith391

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
**/

// let mpWorlds = {};
// const express = require("express");
// const url = require("url");
// const fs = require("fs");

// let createRoom = function(wid) {
// 	let room = {
// 		"world_id": parseInt(wid),
// 		"players": 0,
// 		"playerAccounts": [],
// 		"sockets": []
// 	};
// 	return room;
// };

// let formatRoom = function(room) {
// 	return {
// 		"world_id": room.world_id,
// 		"players": room.players
// 	};
// }

// let pushEvent = function(room, submitterSocket, event) {
// 	for (socket in room.sockets) {
// 		if (socket == submitterSocket) continue;
// 		console.log("send to " + socket);
// 		//socket.write(parseInt(event.id));
// 		//socket.write(event.buffer);
// 	}
// }

// function createGroup(req, res) {
// 	let query = url.parse(req.url, true).query
// 	let name = query["name"];

// 	let valid = validAuthToken(req, res, false);
// 	if (!valid[0]) {
// 		return;
// 	}
// 	let userId = valid[1];
// 	let userMeta = userMetadata(userId);

// 	if (!name) {
// 		res.status(400).json({
// 			"error": 400,
// 			"error_msg": "Invalid request, missing \"name\" query"
// 		})
// 	}

// 	if (userMeta.coins > 50 && userMeta["_SERVER_groups"].length < 10) {
// 		fs.readFile("conf/new_account_id.txt", function(err, data) {
// 			if (err != null)
// 				console.log(err);
// 			let newId = data;
// 			console.log("Creating group \"" + name + "\" with id " + newId);
// 			fs.writeFileSync("conf/new_account_id.txt", (parseInt(newId)+1).toString());
// 			fs.mkdirSync("users/"+newId);
// 			let newUserStatus = 0;
// 			if (EARLY_ACCESS)
// 				newUserStatus += 4; // add "early access" flag
// 			let userInfo = {
// 				"coins": 0,
// 				"is_username_blocked": false,
// 				"profile_image_url": "https://i.pinimg.com/736x/51/8c/1b/518c1be02f6ed77d67ac471e6e4412a6--black-letter-letter-g.jpg",
// 				"id": parseInt(newId),
// 				"username": name,
// 				"user_status": newUserStatus, // see Util.cs in Blocksworld source code for info about user_status
// 				"account_type": "group",
// 				"blocksworld_premium": 0,
// 				"owner_id": userId,
// 				"members": [userId],
// 				"_SERVER_worlds": [],
// 				"description": "A BWMulti group.",
// 				"invite_policy": "open_for_all"
// 			}
// 			fs.writeFileSync("users/"+newId+"/metadata.json", JSON.stringify(userInfo));
// 			fs.writeFileSync("users/"+newId+"/followers.json", "{\"attrs_for_follow_users\": {}}");
// 			fs.writeFileSync("users/"+newId+"/news_feed.json", JSON.stringify({
// 				"news_feed": [
// 					{
// 						"type": 101,
// 						"timestamp": dateString()
// 					}
// 				]
// 			}));
// 			userMeta["_SERVER_groups"].push(parseInt(""+newId));
// 			fs.writeFileSync("users/"+userId+"/metadata.json", JSON.stringify(userMeta));
// 			res.status(200).json({
// 				"group": userInfo
// 			});
// 		});
// 	} else if (userMeta.coins < 50) {
// 		res.status(500).json({
// 			"error": 500,
// 			"error_message": "not_enough_coins"
// 		});
// 	} else {
// 		res.stauts(500).json({
// 			"error": 500,
// 			"error_message": "too_many_groups"
// 		})
// 	}
// }

// function transferWorld(req, res) {
// 	let query = url.parse(req.url, true).query;
// 	let worldId = req.params.wid;
// 	let target = req.params.target;

// 	let valid = validAuthToken(req, res, false);
// 	if (!valid[0]) {
// 		return;
// 	}
// 	let userId = valid[1];
// 	let userMeta = userMetadata(userId);

// 	fullWorld(worldId, false, function(err, world) {
// 		if (world["author_id"] != userId) {
// 			res.status(500).json({
// 				"error": 500,
// 				"error_msg": "You are not owning the world."
// 			})
// 		} else {
// 			let targetMeta = userMetadata(target);
// 			targetMeta["_SERVER_worlds"].push(worldId);
// 			fs.writeFile("users/"+target+"/metadata.json", JSON.stringify(targetMeta), function(err) {
// 				if (err) {
// 					res.status(500);
// 					throw err;
// 				}
// 				world["author_id"] = target;
// 				fs.writeFile("worlds/"+worldId+"/metadata.json", JSON.stringify(world), function(err) {
// 					if (err) {
// 						res.status(500);
// 						throw err;
// 					}
// 					for (i in userMeta["_SERVER_worlds"]) {
// 						if (userMeta["_SERVER_worlds"][i] == worldId) {
// 							userMeta["_SERVER_worlds"].splice(i, 1);
// 						}
// 					}
// 					fs.writeFile("users/"+userId+"/metadata.json", JSON.stringify(userMeta), function(err) {
// 						if (err) {
// 							res.status(500);
// 							throw err;
// 						}
// 						res.status(200).json({
// 							"world": processUserWorld(world)
// 						});
// 					});
// 				});
// 			});
// 		}
// 	});
// }

// function roomEventStream(req, res) {
// 	let roomId = req.params.id;
// 	let worldId = req.params.wid;
// 	if (mpWorlds[worldId] == undefined || mpWorlds[worldId][roomId] == undefined) {
// 		res.status(404).json({
// 			"error": 404,
// 			"error_msg": "Room not available"
// 		});
// 		return;
// 	}
// 	let room = mpWorlds[worldId][roomId];

// 	console.log("event stream");
// 	let socket = req.socket;
// 	let _end = socket.end;
// 	socket.setKeepAlive(true, Number.MAX_SAFE_INTEGER);
// 	socket.setNoDelay(true);

// 	room.sockets.push(socket);

// 	let commandBuf = {
// 		"command": -1,
// 		"length": -1,
// 		"data": Buffer.alloc(0)
// 	}

// 	socket.on("data", function(chunk) {
// 		if (commandBuf.command == -1) { // waiting for command, never sent with the length and data
// 			commandBuf.command = chunk.readUInt8(0);
// 		} else if (commandBuf.length == -1) { // waiting for length, never sent with the data
// 			commandBuf.length = chunk.readUInt32BE(0);
// 		} else if (commandBuf.data.length < commandBuf.length) {
// 			let data = commandBuf.data;
// 			let newData = Buffer.alloc(data.length + chunk.length);
// 			data.copy(newData, 0, 0, data.length);
// 			chunk.copy(newData, data.length, 0, newData.length);
// 			commandBuf.data = newData;
// 		} else {
// 			let type = commandBuf.command;
// 			let data = commandBuf.data;
// 			if (type == 1) { // world source
// 				let buf = Buffer.alloc(commandBuf.length);
// 				data.copy(buf, 0, 0, data.length);

// 			} else {
// 				console.log("unknown type: " + type.toString());
// 			}
// 			commandBuf.command = -1;
// 			commandBuf.length = -1;
// 			commandBuf.data = Buffer.alloc(0);
// 		}
// 	});
// 	socket.on("end", function() {
// 		let room = mpWorlds[worldId][roomId];
// 		for (i in room.sockets) {
// 			if (room.sockets[i] == socket) {
// 				room.sockets.splice(i, 1);
// 			}
// 		}
// 		//_end();
// 	});

// 	socket.end = function() {};
// 	socket.destroy = function() {};
// }

export function run(app) {
  // capabilities["bwmulti"] = {
  // 	"version": "0.1.0"
  // }
  // app.get("/api/v2/worlds/:id/rooms/join_play", function (req, res) {
  // 	let wid = req.params["id"];
  // 	if (mpWorlds[wid] == undefined) {
  // 		mpWorlds[wid] = [createRoom(wid)]; // first room is "build" room
  // 	}
  // 	let latest = mpWorlds[wid][mpWorlds[wid].length-1];
  // 	if (mpWorlds[wid].length != 1 && latest.players < 10) {
  // 		latest.players = latest.players + 1
  // 		res.status(200).json({"room_id": mpWorld[wid].length-1, "room": formatRoom(latest)});
  // 	} else {
  // 		if (mpWorlds[wid].length >= 6) {
  // 			res.status(500).json({
  // 				"error": 500,
  // 				"error_msg": "All rooms are full."
  // 			});
  // 		} else {
  // 			let id = mpWorlds[wid].push(createRoom(wid))-1;
  // 			res.status(200).json({
  // 				"room_id": id,
  // 				"room": formatRoom(mpWorlds[wid][id])
  // 			});
  // 		}
  // 	}
  // });
  // app.get("/api/v2/current_user/groups", function (req, res) {
  // 	let valid = validAuthToken(req, res, false);
  // 	if (!valid[0]) {
  // 		return;
  // 	}
  // 	let userId = valid[1];
  // 	let userMeta = userMetadata(userId);
  // 	let groups = userMeta["_SERVER_groups"];
  // 	for (k in groups) {
  // 		let group = groups[k];
  // 		if (group["owner_id"])
  // 			group["owner_username"] = userMetadata(group["owner_id"]).username;
  // 	}
  // 	res.status(200).json({
  // 		"groups": groups
  // 	});
  // });
  // app.get("/api/v2/worlds/:id/rooms/join_build", function (req, res) {
  // 	let wid = req.params["id"];
  // 	if (mpWorlds[wid] == undefined) {
  // 		mpWorlds[wid] = [createRoom(wid)]; // first room is "build" room
  // 	}
  // 	let buildRoom = mpWorlds[wid][0];
  // 	buildRoom.players = buildRoom.players + 1
  // 	res.status(200).json({
  // 		"room_id": 0,
  // 		"room": formatRoom(buildRoom)
  // 	});
  // });
  // // Rooms events
  // app.get("/api/v2/worlds/:wid/rooms/:id/event_stream", roomEventStream);
  // app.get("/api/v2/worlds/:wid/transfer_to/:target", transferWorld);
  // app.get("/api/v2/groups/create", createGroup);
}
