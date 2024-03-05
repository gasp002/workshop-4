import bodyParser from "body-parser";
import express from "express";
import { BASE_ONION_ROUTER_PORT,REGISTRY_PORT  } from "../config";
import { generateRsaKeyPair, exportPrvKey, exportPubKey,importPrvKey, symDecrypt, rsaDecrypt } from "../crypto"; 
import { Node, RegisterNodeBody } from  "../registry/registry";

let lastReceivedEncryptedMessage: string | null = null;
let lastReceivedDecryptedMessage: string | null = null;
let lastMessageDestination: number | null = null;

export async function simpleOnionRouter(nodeId: number) {
  const onionRouter = express();
  onionRouter.use(express.json());
  onionRouter.use(bodyParser.json());

  const { privateKey, publicKey } = await generateRsaKeyPair();
  
  const publicKeyStr = await exportPubKey(publicKey);

  onionRouter.get("/getPrivateKey", async (req, res) => {
    try {
      const privateKeyStr = await exportPrvKey(privateKey);
      res.json({ result: privateKeyStr });
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve private key" });
    }
  });

  const registerNode: RegisterNodeBody = {
    nodeId: nodeId,
    pubKey: publicKeyStr
  };

  const registryUrl = `http://localhost:${REGISTRY_PORT}/registerNode`;
  try {
    await fetch(registryUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(registerNode),
    });
    console.log(`Node ${nodeId} successfully registered.`);
  } catch (error) {
    console.error(`Failed to register Node ${nodeId}: `);
  }

   onionRouter.get("/status", (req, res) => { res.send('live');});
   onionRouter.post('/message', async (req, res) => {
    try {
        const { encryptedMessage } = req.body;
        res.status(200).json({ message: 'Message received successfully' });
    } catch (error) {
        console.error('Error receiving message:', error);
        res.status(500).json({ error: 'Failed to receive message' });
    }
});

   onionRouter.get('/getLastReceivedEncryptedMessage', (req, res) => {
    res.json({ result: lastReceivedEncryptedMessage });
});

    onionRouter.get('/getLastReceivedDecryptedMessage', (req, res) => {
    res.json({ result: lastReceivedDecryptedMessage });
});

    onionRouter.get('/getLastMessageDestination', (req, res) => {
    res.json({ result: lastMessageDestination });
});

  const server = onionRouter.listen(BASE_ONION_ROUTER_PORT + nodeId, () => {
    console.log(
      `Onion router ${nodeId} is listening on port ${
        BASE_ONION_ROUTER_PORT + nodeId
      }`
    );
  });

  return server;
}