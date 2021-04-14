import assert from "assert";
import { expect } from "chai";
import request from "supertest";
import app from "../main.js";

describe("Unit testing the / route", () => {

	it("should return 403 status", () => {
		return request(app)
			.get("/")
			.then((response) => {
				assert(response.status, 403)
			})
	})

	it("should return 'Forbidden'", () => {
		return request(app)
			.get("/")
			.then((response) => {
				assert(response.text, "Forbidden");
			})
	})

});

describe("Unit testing the /api/v1/ route", () => {

	it("should return 404 status", () => {
		return request(app)
			.get("/api/v1/")
			.then((response) => {
				assert(response.status, 404)
			})
	})

	it("should return expected JSON error message", () => {
		return request(app)
			.get("/api/v1/")
			.then((response) => {
				const json = JSON.parse(response.text)
				assert(json, {
					"error": "404",
					"error_msg": "Not Found",
					"error_details": "This API endpoint has no route handler."
				})
			})
	})

});
