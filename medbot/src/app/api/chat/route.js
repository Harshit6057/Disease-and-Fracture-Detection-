import { GoogleGenAI } from "@google/genai";

const client = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  vertexai: false,
});

export async function POST(req) {
  const { question, context } = await req.json();

  const reportType = context.reportType || 'chest';
  const contextDescription = reportType === 'fracture' 
    ? `This is a fracture detection report. The predicted fracture location is: ${context.fractureLocation || context.predicted_class}. The confidence score and probabilities are provided in the context.`
    : `This is a chest X-ray report. The predicted class is: ${context.predicted_class}. The confidence score and probabilities are provided in the context.`;

  const prompt = `
    You are a medical chatbot specialized in ${reportType === 'fracture' ? 'fracture detection and orthopedic imaging' : 'chest X-ray analysis'}. 
    Answer questions based on the provided report context.
    
    ${contextDescription}
    
    Full Context: ${JSON.stringify(context)}
    
    Question: ${question}
    
    Please provide a helpful, accurate answer based on the report context. If the question cannot be answered from the context, politely say so.
    Answer:
  `;

  try {
    const response = await client.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        { role: "user", parts: [{ text: prompt }] }
      ],
    });

    const text = response.text;  // extract final text

    return new Response(JSON.stringify({ answer: text }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error generating content:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate content" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
