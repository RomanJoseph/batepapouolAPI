import express from "express";
import { MongoClient } from "mongodb";

const app = express();
app.use(express.json());

// conectando ao banco
const mongoClient = new MongoClient("mongodb://localhost:27017");
let db;

mongoClient.connect().then(() => {
	db = mongoClient.db("test");
});