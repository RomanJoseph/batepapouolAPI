import express from "express"
import cors from "cors"
import { MongoClient, ObjectId } from "mongodb"
import dotenv from "dotenv"
dotenv.config()
import joi from "joi"
import dayjs from "dayjs"


//iniciando o server
const app = express();
app.use(express.json());
app.use(cors());

//Funções de valodação joi
const nameSchema = joi.object({
    name: joi.string().required()
})

const messageSchema = joi.object({
    from: joi.string().required(),
    to: joi.string().required(),
    text: joi.string().required(),
    type: joi.string().required().valid('message', 'private_message'),
    time: joi.string().required()
})


// conectando ao banco
const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;

mongoClient.connect().then(() => {
	db = mongoClient.db("BATE_PAPO_UOL_API");
});

//participantes

app.get("/participants", async (req, res) => {
    try{
        const participants = await db.collection("participants").find().toArray()
        res.send(participants)
    }catch(error){
        res.status(500).send(error)
    }
})

app.post("/participants", async (req, res) => {
    let { name } = req.body

    //Valida se o nome não é uma string vazia
    const validation = nameSchema.validate({name})
    if(validation.error){
        res.status(422).send(validation.error.details[0].message)
        return
    }

    //Valida se o nome não está cadastrado
    try{
        const isUserAlreadyOn = await db.collection("participants").findOne({name});
        if(isUserAlreadyOn){
            res.status(409).send("Usuário já cadastrado");
            return
        }
    } catch(error) {
        res.status(500).send(error)
        return
    }

    //Passou pela validação.
    try {
        await db.collection("participants").insertOne({
            name,
            lastStatus: Date.now()
        })
        res.sendStatus(201)
    } catch(error) {
        res.status(500).send(error)
    }

    //Envia mensagem de Login ao servidor

    try{
        await db.collection("messages").insertOne({
            from: name,
            to: "Todos",
            text: "entra na sala...",
            type: "statu",
            time: dayjs().format("HH:mm:ss")
        })
    }catch(error){
        res.status(500).send(error)
    }
}) 

//Filtrar usuários inativos

setInterval(async () => {
    let users = [];
    const now = Date.now();

    //Pega todos os usuários do banco de dados
    try{
        users = await db.collection("participants").find().toArray()
    }catch(error){
        console.log(error)
    }

    //Define quais usuários estão inativos
    const inactiveUsers = users.filter(user => now - user.lastStatus > 10000)

    //Deleta usuários inativos e manda mensagem ao servidor
    for(let i = 0; i < inactiveUsers.length; i++){
        const inactiveUser = {_id: inactiveUsers[i]._id}

        try{
            await db.collection("participants").deleteOne(inactiveUser)
        }catch(error){
            console.log(error)
            break
        }
    
    //Envia mensagem ao servidor
    try {
        await db.collection("messages").insertOne({
            from: inactiveUsers[i].name,
            to: "Todos",
            text: "sai da sala...",
            type: "status",
            time: dayjs().format("HH:mm:ss")
        })
    } catch (error) {
        console.log(error);
        break;
    }

    }
},15000)


//Define quais mensagens serão enviadas ao usuário
function limitMessage(message, user) {
    if (message.type === 'private_message') {
        if (message.from === user || message.to === user){
            return true;
        } else {
            return false;
        }
    }
    return true;
}

//Pega as mensagens do servidor
app.get("/messages", async (req,res) => {
    const limit = parseInt(req.query.limit) //Define o número de mensagens a ser exibido
    const { user } = req.headers

    try {
        const messages = await db.collection("messages").find().toArray()
        let messagesToView = messages.filter((message) => limitMessage(message, user))   
        messagesToView = messagesToView.slice(-limit);
        res.send(messagesToView)
    }catch(error) {
        res.status(500).send(error)
    }
})

app.post("/messages", async (req, res) => {
    let { to, text, type } = req.body
    let { user } = req.headers

    const message = {from: user, to, text, type, time: dayjs().format('HH:mm:ss')}
    const validation = messageSchema.validate(message, {abortEarly: false})

    if(validation.error){
        res.status(422).send(validation.error.details.map(err => err.message));
        return
    }

    try { //Checha se o usuário que quer enviar a mensagem é um usuário da lista de participantes
        const isValidName = await db.collection("participants").findOne({name:user})
        if(!isValidName){
            res.status(422).send("Usuário Inválido")
            return
        }
    }catch(error){
        res.status(500).send(error)
        return
    }

    try { //Envia a mensagem
        await db.collection("messages").insertOne(message)
        res.sendStatus(201)
    } catch(error){
        res.status(500).send(error)
    }

})

//Status do usuário (On/Off)

app.post("/status", async(req , res) => {
    let { user } = req.headers

    //Checa se o usuário existe

    try {
        const isNameLogged = await db.collection("participants").findOne({name:user})

        if(!isNameLogged){
            res.sendStatus(404);
            return;
        }
    } catch(error){
        res.status(500).send(error)
        return;
    }

    try{
        await db.collection('participants').updateOne({name: user},{$set: {lastStatus: Date.now()}})        
        res.sendStatus(200)
    }catch(error){
        res.status(500).send(error);
    }
})



app.listen(5000)