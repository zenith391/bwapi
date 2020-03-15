let mpWorlds = {};
const express = require("express");
const url = require("url");

let createRoom = function(wid) {
	let room = {
		"world_id": parseInt(wid),
		"players": 0,
		"playerAccounts": [],
		"sockets": []
	};
	return room;
};

let formatRoom = function(room) {
	return {
		"world_id": room.world_id,
		"players": room.players
	};
}

let pushEvent = function(room, submitterSocket, event) {
	for (socket in room.sockets) {
		if (socket == submitterSocket) continue;
		socket.write(parseInt(event.id));
		socket.write(event.buffer);
	}
}

function createGroup(req, res) {
	let query = require("url").parse(req.url, true).query
	let name = query["name"];

	let valid = validAuthToken(req, res, false);
	if (!valid[0]) {
		return;
	}
	let userId = valid[1];

	if (!name) {
		res.status(400).json({
			"error": 400,
			"error_msg": "Invalid request, missing \"name\" query"
		})
	}

	fs.readFile("conf/new_account_id.txt", function(err, data) {
		if (err != null)
			console.log(err);
		let newId = data;
		console.log("Creating group \"" + name + "\" with id " + newId)
		fs.writeFileSync("conf/new_account_id.txt", (parseInt(newId)+1).toString());
		fs.mkdirSync("users/"+newId);
		let newUserStatus = 0;
		if (EARLY_ACCESS)
			newUserStatus += 4; // add "early access" flag
		let userInfo = {
			"coins": 0,
			"is_username_blocked": false,
			"profile_image_url": "https://i.pinimg.com/736x/51/8c/1b/518c1be02f6ed77d67ac471e6e4412a6--black-letter-letter-g.jpg",
			"id": parseInt(newId),
			"username": name,
			"user_status": newUserStatus, // see Util.cs in Blocksworld source code for info about user_status
			"account_type": "group",
			"blocksworld_premium": 0,
			"owner_id": userId,
			"_SERVER_worlds": []
		}
		fs.writeFileSync("users/"+newId+"/metadata.json", JSON.stringify(userInfo));
		fs.writeFileSync("users/"+newId+"/followed_users.json", "{\"attrs_for_follow_users\": {}}");
		fs.writeFileSync("users/"+newId+"/followers.json", "{\"attrs_for_follow_users\": {}}");
		fs.writeFileSync("users/"+newId+"/news_feed.json", JSON.stringify({
			"news_feed": [
				{
					"type": 101,
					"timestamp": dateString()
				}
			]
		}));
		res.status(200).json({
			"group": userInfo
		});
	});
}

function roomEventStream(req, res) {
	let roomId = req.params.id;
	let worldId = req.params.wid;
	if (mpWorlds[worldId] == undefined || mpWorlds[worldId][roomId] == undefined) {
		res.status(404).json({
			"error": 404,
			"error_msg": "Room not available"
		});
		return;
	}
	let room = mpWorlds[worldId][roomId]; 

	console.log("event stream");
	let socket = req.socket;
	let _end = socket.end; // will be overriden later
	socket.setKeepAlive(true, Number.MAX_SAFE_INTEGER);
	socket.setNoDelay(true);

	let commandBuf = {
		"command": -1,
		"length": -1,
		"data": Buffer.alloc(0)
	}

	socket.on("data", function(chunk) {
		if (commandBuf.command == -1) { // waiting for command, never sent with the length and data
			commandBuf.command = chunk.readUInt8(0);
		} else if (commandBuf.length == -1) { // waiting for length, never sent with the data
			commandBuf.length = chunk.readUInt32BE(0);
		} else if (commandBuf.data.length < commandBuf.length) {
			let data = commandBuf.data;
			let newData = Buffer.alloc(data.length + chunk.length);
			data.copy(newData, 0, 0, data.length);
			chunk.copy(newData, data.length, 0, newData.length);
			commandBuf.data = newData;
		} else {
			let type = commandBuf.command;
			let data = commandBuf.data;
			if (type == 1) { // world source
				let buf = Buffer.alloc(commandBuf.length);
				data.copy(buf, 0, 0, data.length);
				pushEvent(room, socket, {
					"id": type,
					"length": commandBuf.length,
					"buffer": data
				});
			} else {
				console.log("unknown type: " + type.toString());
			}
			commandBuf.command = -1;
			commandBuf.length = -1;
			commandBuf.data = Buffer.alloc(0);
		}
	});
	socket.on("end", function() {
		let room = mpWorlds[worldId][roomId];
		for (i in room.sockets) {
			if (room.sockets[i] == id) {
				room.sockets.splice(i, 1);
			}
		}
		_end();
		console.error("CLOSED!");
	});

	socket.end = function() {};
	socket.destroy = function() {};
}

module.exports.run = function(app) {
	capabilities["bwmulti"] = {
		"version": "0.1.0"
	}

	app.get("/api/v2/worlds/:id/rooms/join_play", function (req, res) {
		let wid = req.params["id"];
		if (mpWorlds[wid] == undefined) {
			mpWorlds[wid] = [createRoom(wid)]; // first room is "build" room
		}

		let latest = mpWorlds[wid][mpWorlds[wid].length-1];
		if (mpWorlds[wid].length != 1 && latest.players < 10) {
			latest.players = latest.players + 1
			res.status(200).json({"room_id": mpWorld[wid].length-1, "room": formatRoom(latest)});
		} else {
			if (mpWorlds[wid].length >= 6) {
				res.status(500).json({
					"error": 500,
					"error_msg": "All rooms are full."
				});
			} else {
				let id = mpWorlds[wid].push(createRoom(wid))-1;
				res.status(200).json({
					"room_id": id,
					"room": formatRoom(mpWorlds[wid][id])
				});
			}
		}
	});

	app.get("/api/v2/worlds/:id/rooms/join_build", function (req, res) {
		let wid = req.params["id"];
		if (mpWorlds[wid] == undefined) {
			mpWorlds[wid] = [createRoom(wid)]; // first room is "build" room
		}

		let buildRoom = mpWorlds[wid][0];
		buildRoom.players = buildRoom.players + 1
		res.status(200).json({
			"room_id": 0,
			"room": formatRoom(buildRoom)
		});
	});

	// Rooms events
	app.get("/api/v2/worlds/:wid/rooms/:id/event_stream", roomEventStream);
	app.get("/api/v2/groups/create", createGroup);
};
