import bodyParser from "body-parser";
import express from "express";
import { BASE_USER_PORT,REGISTRY_PORT } from "../config";
import { symEncrypt, rsaEncrypt, importPubKey, createRandomSymmetricKey, exportSymKey } from "../crypto";
import { Node, RegisterNodeBody  } from '../registry/registry';
import { webcrypto } from "crypto";


let lastReceivedMessage: string | null = null;
let lastSentMessage: string | null = null;

export type SendMessageBody = {
  message: string;
  destinationUserId: number;
};

interface RegistryData {
  nodes: Node[];
}

interface PublicKeyResponse {
  publicKey: string;
}

export async function user(userId: number) {
  const _user = express();
  _user.use(express.json());
  _user.use(bodyParser.json());

  // TODO implement the status route
   _user.get("/status", (req, res) => { res.send('live');});





//test

_user.post('/sendMessage', async (req, res) => {
  try {
      const { message, destinationUserId } = req.body;
      
      const registryResponse = await fetch(`http://localhost:${REGISTRY_PORT}/getNodeRegistry`);
      const registryData = await registryResponse.json() as RegistryData;
      const nodes: Node[] = registryData.nodes;

      const circuit = createRandomCircuit(nodes.length);

      const symmetricKeys: Promise<webcrypto.CryptoKey>[] = [];
      for (let i = 0; i < 3; i++) {
      symmetricKeys.push( createRandomSymmetricKey());
}

      let encryptedMessage = message;
      for (const nodeId of circuit) {

        const symmetricKey = await createRandomSymmetricKey(); 
        const publicKeyStr = await fetchPublicKey(nodeId);
        const publicKey = await importPubKey(publicKeyStr);
        
        const symmetricKeyCryptoKey = await exportSymKey(symmetricKey); 
        const encryptedSymmetricKey = await rsaEncrypt(symmetricKeyCryptoKey, publicKeyStr);
        const stepDestination = padNodeId(nodeId);
        const encryptedData = await symEncrypt(symmetricKey, stepDestination + encryptedMessage);

        encryptedMessage = encryptedSymmetricKey + encryptedData;
      }

      await forwardEncryptedMessage(circuit[0], encryptedMessage);
      res.status(200).json({ message: 'Message sent successfully' });

  } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({ error: 'Failed to send message' });
  }
});

async function fetchPublicKey(nodeId: number): Promise<string> {
  const response = await fetch(`http://localhost:4000/node/${nodeId}/publicKey`);
  const data = await response.json() as PublicKeyResponse ;
  return data.publicKey;
}

async function forwardEncryptedMessage(nodeId: number, encryptedMessage: string): Promise<void> {
  await fetch(`http://localhost:4000/node/${nodeId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ encryptedMessage })
  });
}

function createRandomCircuit(nodeCount: number): number[] {
  if (nodeCount < 3) {
      throw new Error("Insufficient number of nodes to create a circuit");
  }

  const circuit: number[] = [];
  while (circuit.length < 3) {
      const randomNodeId = Math.floor(Math.random() * nodeCount);
      if (!circuit.includes(randomNodeId)) {
          circuit.push(randomNodeId);
      }
  }

  return circuit;
}

function padNodeId(nodeId: number): string {
  return nodeId.toString().padStart(10, '0');
}
   _user.post("/message", (req, res) => {
    const { message }: { message: string } = req.body;
  
    lastReceivedMessage = message;
    console.log(`User ${userId} received message: ${lastReceivedMessage}`);

   res.send('success');
  });

   _user.get('/getLastReceivedMessage', (req, res) => {
    console.log(`User ${userId} received message: ${lastReceivedMessage}`);

    res.json({ result : lastReceivedMessage });
});

  _user.get('/getLastSentMessage', (req, res) => {
    res.json({ result: lastSentMessage });
});

  const server = _user.listen(BASE_USER_PORT + userId, () => {
    console.log(
      `User ${userId} is listening on port ${BASE_USER_PORT + userId}`
    );
  });

  return server;
}