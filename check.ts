import { Client } from '@gradio/client';

async function main() {
  const c = await Client.connect('GanymedeNil/Qwen2-VL-7B');
  console.log(JSON.stringify(c, null, 2));
}

main().catch(console.error);
