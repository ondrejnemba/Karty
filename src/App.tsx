import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { Download, Loader2, Printer, RefreshCw, Image as ImageIcon } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const WORDS = [
  "Pes", "Auto", "Jablko", "Hruška", "Letadlo", "Včela",
  "Vlak", "Kočka", "Jahoda", "Rohlík", "Sklenička", "Čert",
  "Hrad", "Rytíř", "Pirát", "Kytička", "Veverka", "Miminko",
  "Postel", "Dům", "Raketa", "Sluníčko", "Mrak", "Měsíc",
  "Kartáček na zuby", "Deštník", "Boty", "Kočárek", "Strom", "Houba",
  "Žížala", "Čepice s bambulí", "Knížka", "Rukavice", "Klíč", "Zvon"
];

interface CardData {
  word: string;
  imageUrl: string | null;
  loading: boolean;
  error: boolean;
}

export default function App() {
  const [cards, setCards] = useState<CardData[]>(
    WORDS.map(word => ({ word, imageUrl: null, loading: false, error: false }))
  );
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [progress, setProgress] = useState(0);
  const pagesRef = useRef<(HTMLDivElement | null)[]>([]);

  const generateImage = async (index: number, retryCount = 0) => {
    const word = WORDS[index];
    setCards(prev => prev.map((c, i) => i === index ? { ...c, loading: true, error: false } : c));

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const prompt = `Simple black and white line art illustration of a ${word}, minimalist coloring book style, clean thick borders, no shading, white background, single object centered.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: prompt }] },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
          }
        }
      });

      let imageUrl = null;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      if (imageUrl) {
        setCards(prev => prev.map((c, i) => i === index ? { ...c, imageUrl, loading: false } : c));
        return true;
      } else {
        throw new Error("No image generated");
      }
    } catch (error: any) {
      console.error(`Error generating image for ${word}:`, error);
      
      // Handle rate limiting (429) with exponential backoff
      if (error?.status === "RESOURCE_EXHAUSTED" || error?.message?.includes("429") || error?.code === 429) {
        if (retryCount < 5) {
          const delay = Math.pow(2, retryCount) * 2000 + Math.random() * 1000;
          console.log(`Rate limit hit for ${word}. Retrying in ${Math.round(delay/1000)}s... (Attempt ${retryCount + 1})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return generateImage(index, retryCount + 1);
        }
      }

      setCards(prev => prev.map((c, i) => i === index ? { ...c, loading: false, error: true } : c));
      return false;
    }
  };

  const generateAllImages = async () => {
    for (let i = 0; i < WORDS.length; i++) {
      if (!cards[i].imageUrl) {
        const success = await generateImage(i);
        setProgress(Math.round(((i + 1) / WORDS.length) * 100));
        
        // Add a small delay between successful requests to prevent hitting rate limits
        if (success && i < WORDS.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
  };

  const downloadPdf = async () => {
    setIsGeneratingPdf(true);
    const pdf = new jsPDF('p', 'mm', 'a4');
    
    try {
      for (let i = 0; i < 3; i++) {
        const pageElement = pagesRef.current[i];
        if (pageElement) {
          const canvas = await html2canvas(pageElement, {
            scale: 2,
            useCORS: true,
            logging: false,
          });
          const imgData = canvas.toDataURL('image/jpeg', 0.95);
          if (i > 0) pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
        }
      }
      pdf.save('vyukove-karticky.pdf');
    } catch (error) {
      console.error("PDF generation error:", error);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const allImagesLoaded = cards.every(c => c.imageUrl !== null);

  return (
    <div className="min-h-screen p-4 md:p-8 flex flex-col items-center">
      <header className="max-w-4xl w-full mb-12 text-center">
        <h1 className="text-4xl md:text-6xl font-serif font-bold mb-4 tracking-tight">
          Výukové Kartičky
        </h1>
        <p className="text-stone-500 font-sans text-lg max-w-2xl mx-auto">
          36 černobílých ilustrovaných kartiček pro děti. Vygenerujte obrázky a stáhněte si je jako PDF připravené k tisku.
        </p>
        
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          {!allImagesLoaded && (
            <button
              onClick={generateAllImages}
              className="flex items-center gap-2 bg-stone-900 text-white px-6 py-3 rounded-full hover:bg-stone-800 transition-all font-medium shadow-lg"
            >
              <RefreshCw className={cn("w-5 h-5", progress > 0 && progress < 100 && "animate-spin")} />
              {progress > 0 && progress < 100 ? `Generování (${progress}%)` : "Vygenerovat všechny obrázky"}
            </button>
          )}
          
          {allImagesLoaded && (
            <>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 bg-stone-200 text-stone-900 px-6 py-3 rounded-full hover:bg-stone-300 transition-all font-medium shadow-sm"
              >
                <Printer className="w-5 h-5" />
                Vytisknout přímo
              </button>
              <button
                onClick={downloadPdf}
                disabled={isGeneratingPdf}
                className="flex items-center gap-2 bg-orange-600 text-white px-6 py-3 rounded-full hover:bg-orange-500 transition-all font-medium shadow-lg disabled:opacity-50"
              >
                {isGeneratingPdf ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Download className="w-5 h-5" />
                )}
                Stáhnout PDF (A4)
              </button>
            </>
          )}
        </div>
      </header>

      <main className="space-y-12 pb-20">
        {[0, 1, 2].map(pageIdx => (
          <div key={pageIdx} className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 text-stone-400 text-sm font-mono uppercase tracking-widest">
              <Printer className="w-4 h-4" />
              Strana {pageIdx + 1} / 3
            </div>
            <div 
              ref={el => pagesRef.current[pageIdx] = el}
              className="card-grid border-stone-200 border"
            >
              {cards.slice(pageIdx * 12, (pageIdx + 1) * 12).map((card, idx) => (
                <div key={idx} className="flashcard border-stone-100 border">
                  <div className="flex-1 flex items-center justify-center w-full p-4 relative">
                    {card.imageUrl ? (
                      <img 
                        src={card.imageUrl} 
                        alt={card.word} 
                        className="max-w-full max-h-full object-contain"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-stone-300">
                        {card.loading ? (
                          <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
                        ) : (
                          <>
                            <ImageIcon className="w-12 h-12 opacity-20" />
                            <button 
                              onClick={() => generateImage(pageIdx * 12 + idx)}
                              className="text-[10px] uppercase tracking-tighter hover:text-stone-600 transition-colors"
                            >
                              Generovat
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    {card.error && (
                      <div className="absolute inset-0 flex items-center justify-center bg-red-50/80 text-red-500 text-[10px] text-center p-2">
                        Chyba generování. Zkuste to znovu.
                      </div>
                    )}
                  </div>
                  <div className="h-12 flex items-center justify-center w-full border-t border-stone-50">
                    <span className="text-xl font-serif font-bold text-stone-800">
                      {card.word}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-md border-t border-stone-100 p-4 flex justify-center">
        <div className="flex items-center gap-4 text-xs text-stone-400 font-medium uppercase tracking-widest">
          <span>36 Kartiček</span>
          <span className="w-1 h-1 bg-stone-300 rounded-full" />
          <span>Černobílé ilustrace</span>
          <span className="w-1 h-1 bg-stone-300 rounded-full" />
          <span>Formát A4</span>
        </div>
      </footer>
    </div>
  );
}
