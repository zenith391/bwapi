import { User } from "./users.js";
// Get the auth token from a request object
export function getAuthToken(req) {
    let authToken = undefined;
    if (req.headers["bw-auth-token"] !== undefined) {
        authToken = req.headers["bw-auth-token"];
    }
    return authToken;
}
// just internally used helper functions
export function value2(v) {
    if (typeof (v) == "object") {
        return v[0];
    }
    else {
        return v;
    }
}
// Internally used
export function value(body, name) {
    let v = body[name];
    if (typeof (v) == "object") {
        return v[0];
    }
    else {
        return v;
    }
}
// Function used to validate an user's auth token and get to whom it belongs.
export function validAuthToken(req, res, bodyCheck) {
    let authToken = getAuthToken(req);
    if (authToken === undefined) {
        res.status(405).json({
            "error": 405,
            "error_msg": "missing authentication token"
        });
        return { ok: false, user: new User(0), authToken: "" };
    }
    let userId = global.authTokens[authToken];
    if (userId == undefined) {
        res.status(405).json({
            "error": 405,
            "error_msg": "unauthentificated user"
        });
        return { ok: false, user: new User(0), authToken: "" };
    }
    if (bodyCheck && (req.body == undefined || req.body == null)) {
        res.status(400).json({
            "error": "no body"
        });
        return { ok: false, user: new User(0), authToken: "" };
    }
    return {
        ok: true,
        user: new User(userId),
        authToken: authToken
    };
}
// Helper function for ISO date formatting
function datePart(num) {
    let str = num.toString();
    if (str.length < 2) {
        str = "0" + str;
    }
    return str;
}
// Format a 'Date' object in ISO format.
export function dateString(date) {
    if (date === undefined || date === null) {
        date = new Date(); // default to current date
    }
    let currDateStr = date.getUTCFullYear()
        + '-'
        + datePart(date.getUTCMonth() + 1)
        + '-'
        + datePart(date.getUTCDate()) + 'T'
        + datePart(date.getUTCHours()) + ':'
        + datePart(date.getUTCMinutes()) + ':'
        + datePart(date.getSeconds()) + "+00:00";
    return currDateStr;
}
