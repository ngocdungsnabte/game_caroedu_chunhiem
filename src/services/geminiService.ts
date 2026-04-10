import { GoogleGenAI, Type } from "@google/genai";
import mammoth from "mammoth";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface GeneratedQuestion {
  text: string;
  options: string[];
  correctAnswer: number;
}

export async function generateQuestions(file: File): Promise<GeneratedQuestion[]> {
  let contentPart: any;

  if (file.type.startsWith('image/') || file.type === 'application/pdf') {
    const base64Data = await fileToBase64(file);
    contentPart = {
      inlineData: {
        data: base64Data,
        mimeType: file.type,
      },
    };
  } else if (file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    contentPart = {
      text: `Nội dung tài liệu: ${result.value}`,
    };
  } else if (file.type === 'text/plain' || file.name.endsWith('.csv') || file.name.endsWith('.json')) {
    const text = await file.text();
    contentPart = {
      text: `Nội dung tài liệu: ${text}`,
    };
  } else {
    throw new Error('Định dạng tệp không được hỗ trợ. Vui lòng tải lên hình ảnh, PDF hoặc Word.');
  }

  const prompt = `Dựa trên nội dung tài liệu được cung cấp, hãy tạo ra tối đa 20 câu hỏi trắc nghiệm kiến thức. 
  Mỗi câu hỏi phải có 4 lựa chọn và chỉ có 1 đáp án đúng duy nhất.
  Ngôn ngữ: Tiếng Việt.
  Đảm bảo các câu hỏi đa dạng và bao quát nội dung tài liệu.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        contentPart,
        { text: prompt }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING, description: "Nội dung câu hỏi" },
            options: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "Danh sách 4 lựa chọn"
            },
            correctAnswer: { 
              type: Type.INTEGER, 
              description: "Chỉ số của câu trả lời đúng (0-3)" 
            }
          },
          required: ["text", "options", "correctAnswer"]
        }
      }
    }
  });

  try {
    const questions = JSON.parse(response.text);
    return questions.slice(0, 20);
  } catch (error) {
    console.error("Lỗi khi phân tích câu hỏi từ AI:", error);
    throw new Error("Không thể tạo câu hỏi từ tài liệu này. Vui lòng thử lại.");
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = error => reject(error);
  });
}
