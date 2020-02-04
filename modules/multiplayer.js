let mpWorlds = {};
const express = require("express");
const url = require("url");

let createRoom = function(wid) {
	let room = {
		"world_id": parseInt(wid),
		"players": 0,
		"host": "Zen1th",
		"events": []
	};
	return room;
};

let formatRoom = function(room) {
	return {
		"world_id": room.world_id,
		"players": room.players
	};
}

let pushEvent = function(room, event) {
	event.timestamp = Date.now();
	room.events.push(event);
}

module.exports.run = function(app) {
	capabilities["bwmulti"] = {
		"version": "1.0.0"
	}

	app.get("/api/v2/worlds/:id/join_room", function (req, res) {
		let wid = req.params["id"];
		if (mpWorlds[wid] == undefined) {
			mpWorlds[wid] = [createRoom(wid)]; // first room is "build" room
		}
		if (mpWorlds[wid].length >= 6) {
			res.status(500).json({
				"error": 500,
				"error_msg": "All rooms full"
			})
		} else {
			let id = mpWorlds[wid].push(createRoom(wid))-1;
			pushEvent(mpWorlds[wid][id], {
				"type": "block_move",
				"position": [0, 10, 0]
			});
			pushEvent(mpWorlds[wid][id], {
				"type": "blockster_spawn",
				"name": "Zen1th"
			});
			res.status(200).json({"room_id": id, "room": formatRoom(mpWorlds[wid][id])});
		}
	});

	// Rooms events
	app.get("/api/v2/worlds/:wid/rooms/:id/event_stream", function(req, res) {
		console.log("event stream")
		let socket = req.socket;
		socket.resume();
		socket.on("data", function (chunk) {
			if (!Buffer.isBuffer(chunk)) {
				chunk = Buffer.from(chunk);
			}
			let type = chunk.readUInt8(0);
			if (type == 1) {
				let len = chunk.readUInt16BE(1);
			}
		});

		/*
		let event = JSON.parse(req.body["event_json_str"]);
		if (mpWorlds[req.params.wid] == undefined) {
			res.status(404).json({
				"error": 404,
				"error_msg": "World have no rooms"
			});
			return;
		}
		let room = mpWorlds[req.params.wid][parseInt(req.params.id)];
		if (room == undefined) {
			res.status(404).json({
				"error": 404,
				"error_msg": "No such room"
			});
			return;
		}
		pushEvent(room, event);
		res.status(200).json({
			"event": event
		});*/
	});

	app.get("/api/v2/worlds/:wid/rooms/:id/events", function(req, res) {
		let lastTimestamp = parseInt(url.parse(req.url, true).query.last);
		if (isNaN(lastTimestamp)) {
			res.status(404).json({
				"error": 404,
				"error_msg": "Invalid last timestamp"
			});
			return;
		}
		if (mpWorlds[req.params.wid] == undefined) {
			res.status(404).json({
				"error": 404,
				"error_msg": "World have no rooms"
			});
			return;
		}
		let room = mpWorlds[req.params.wid][parseInt(req.params.id)];
		if (room == undefined) {
			res.status(404).json({
				"error": 404,
				"error_msg": "No such room"
			});
			return;
		}
		let evt = [];
		for (i in room.events) {
			let e = room.events[i];
			if (e != undefined) {
				if (Date.now() - 5000 > e.timestamp) {
					room.events[i] = undefined;
				}
				if (room.events[i] != undefined && e.timestamp >= lastTimestamp) {
					evt.push(e);
				}
			}
		}
		res.status(200).json({
			"events": evt
		});
	});
};
