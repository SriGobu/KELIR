const OpenAI = require("openai");
const botResponse = async (message) => {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
  });

  const response = await client.chat.completions.create({
    model: "openai/gpt-oss-20b",
    messages: [{ role: "user", content: message }],
  });
  const text = response.choices[0].message.content;
  return text;
};

module.exports = { botResponse };
