const fs = require("fs");

const data = {
  server: "ultra@genesis",
  password: "19819",
  model: "NIL",
};

const filePath = "passwords.json";
const raw = fs.readFileSync(filePath, "utf8");
const passwords = JSON.parse(raw);

if (!Array.isArray(passwords.known)) {
  passwords.known = [];
}

passwords.known.push(data);

fs.writeFileSync(filePath, JSON.stringify(passwords, null, 4));
console.log("Successfully wrote data to passwords.json -> known");
