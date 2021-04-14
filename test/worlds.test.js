import assert from "assert";
import { expect } from "chai";
import request from "supertest";
import app from "../main.js";

describe("Unit testing getting a non-existent world (id 123456789)", () => {

	it("should return 404 status", () => {
		return request(app)
			.get("/api/v1/worlds/123456789")
			.then((response) => {
				assert(response.status, 404)
			})
	})

});
