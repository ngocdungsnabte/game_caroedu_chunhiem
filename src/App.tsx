/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  RotateCcw, 
  Play, 
  Trophy, 
  User, 
  Settings, 
  Info, 
  ChevronLeft,
  History,
  Globe,
  Cpu,
  Monitor,
  Languages,
  Scale,
  Hash,
  Upload,
  FileText,
  Image as ImageIcon,
  File as FileIcon,
  Save,
  Volume2,
  VolumeX,
  Music,
  Sprout,
  Leaf
} from 'lucide-react';
import confetti from 'canvas-confetti';

import { generateQuestions, GeneratedQuestion } from './services/geminiService';

type Player = 'X' | 'O';
type BoardSize = 4 | 5 | 6;
type View = 'home' | 'game' | 'settings';

interface Question {
  id: string;
  text: string;
  options: string[];
  correctAnswer: number;
}

interface Subject {
  id: string;
  name: string;
  icon: React.ReactNode;
  color: string;
  questions: Question[];
}

interface GameState {
  board: (Player | null)[];
  currentPlayer: Player;
  winner: Player | 'Draw' | null;
  winningLine: number[] | null;
  size: BoardSize;
  score: { X: number; O: number };
  selectedSubject: Subject | null;
  pendingCellIndex: number | null;
  currentQuestion: Question | null;
  usedQuestionIds: string[];
  timeLeft: number;
  isTimerActive: boolean;
}

const MOCK_QUESTIONS: Record<string, Question[]> = {
  history: [],
  geography: [],
  tech: [],
  it: [],
  english: [],
  ktpl: [],
};

const SUBJECTS: Subject[] = [
  { id: 'history', name: 'Lịch sử', icon: <History />, color: 'bg-amber-500', questions: MOCK_QUESTIONS.history },
  { id: 'geography', name: 'Địa lý', icon: <Globe />, color: 'bg-emerald-500', questions: MOCK_QUESTIONS.geography },
  { id: 'tech', name: 'Công nghệ', icon: <Sprout />, color: 'bg-emerald-600', questions: MOCK_QUESTIONS.tech },
  { id: 'it', name: 'Tin học', icon: <Monitor />, color: 'bg-indigo-500', questions: MOCK_QUESTIONS.it },
  { id: 'english', name: 'Tiếng Anh', icon: <Languages />, color: 'bg-rose-500', questions: MOCK_QUESTIONS.english },
  { id: 'ktpl', name: 'Giáo dục KTPL', icon: <Scale />, color: 'bg-purple-500', questions: MOCK_QUESTIONS.ktpl },
];

export default function App() {
  const [view, setView] = useState<View>('home');
  const [isMusicEnabled, setIsMusicEnabled] = useState(false);
  const [gameState, setGameState] = useState<GameState>({
    board: Array(16).fill(null),
    currentPlayer: 'X',
    winner: null,
    winningLine: null,
    size: 4,
    score: { X: 0, O: 0 },
    selectedSubject: null,
    pendingCellIndex: null,
    currentQuestion: null,
    usedQuestionIds: [],
    timeLeft: 15,
    isTimerActive: false,
  });

  const [settingsSubject, setSettingsSubject] = useState<Subject | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);

  const initAudio = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (!bgMusicRef.current) {
      bgMusicRef.current = new Audio('https://cdn.pixabay.com/audio/2022/01/18/audio_d0a13f69d2.mp3');
      bgMusicRef.current.loop = true;
      bgMusicRef.current.volume = 0.2;
    }
  };

  const toggleMusic = () => {
    initAudio();
    if (isMusicEnabled) {
      bgMusicRef.current?.pause();
    } else {
      bgMusicRef.current?.play().catch(e => console.log("Music play blocked", e));
    }
    setIsMusicEnabled(!isMusicEnabled);
  };

  useEffect(() => {
    let timer: any;
    if (gameState.isTimerActive && gameState.timeLeft > 0) {
      timer = setInterval(() => {
        setGameState(prev => {
          const newTime = prev.timeLeft - 1;
          if (newTime <= 3 && newTime > 0) {
            playSound('fastTick');
          } else if (newTime > 3) {
            playSound('tick');
          }
          
          if (newTime === 0) {
            playSound('timeout');
            // Handle timeout - treat as incorrect answer
            setTimeout(() => {
              handleAnswer(-1); // -1 will never match a correct answer
            }, 500);
          }
          
          return { ...prev, timeLeft: newTime };
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [gameState.isTimerActive, gameState.timeLeft]);

  const playSound = (type: 'click' | 'win' | 'draw' | 'start' | 'correct' | 'incorrect' | 'tick' | 'fastTick' | 'timeout') => {
    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;
    const now = ctx.currentTime;

    const createOscillator = (freq: number, startTime: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.1) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(volume, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    if (type === 'click') {
      createOscillator(440, now, 0.1, 'sine', 0.1);
    } else if (type === 'win') {
      // Celebratory fanfare + simulated "clapping" noise
      [523.25, 659.25, 783.99, 1046.50, 1318.51].forEach((f, i) => {
        createOscillator(f, now + i * 0.1, 0.6, 'triangle', 0.1);
      });
      // Clapping simulation (short bursts of noise)
      for (let i = 0; i < 10; i++) {
        const t = now + 0.5 + Math.random() * 2;
        createOscillator(200 + Math.random() * 400, t, 0.05, 'sawtooth', 0.05);
      }
    } else if (type === 'draw') {
      createOscillator(220, now, 0.3, 'sawtooth', 0.1);
    } else if (type === 'start') {
      createOscillator(330, now, 0.1, 'square', 0.05);
      createOscillator(660, now + 0.1, 0.2, 'square', 0.05);
    } else if (type === 'correct') {
      // Upward arpeggio for success
      createOscillator(523.25, now, 0.1, 'sine', 0.1); // C5
      createOscillator(659.25, now + 0.08, 0.1, 'sine', 0.1); // E5
      createOscillator(783.99, now + 0.16, 0.2, 'sine', 0.1); // G5
      createOscillator(1046.50, now + 0.24, 0.3, 'sine', 0.1); // C6
    } else if (type === 'incorrect') {
      // Low, dissonant buzz for failure
      createOscillator(130.81, now, 0.2, 'sawtooth', 0.1); // C3
      createOscillator(123.47, now + 0.05, 0.2, 'sawtooth', 0.1); // B2
      createOscillator(110.00, now + 0.1, 0.4, 'square', 0.1); // A2
    } else if (type === 'tick') {
      createOscillator(880, now, 0.05, 'sine', 0.05);
    } else if (type === 'fastTick') {
      createOscillator(1760, now, 0.05, 'sine', 0.1);
    } else if (type === 'timeout') {
      // Bell sound
      [440, 554.37, 659.25, 880].forEach((f, i) => {
        createOscillator(f, now + i * 0.05, 0.5, 'sine', 0.1);
      });
    }
  };

  const checkWinner = useCallback((board: (Player | null)[], size: BoardSize) => {
    const winCount = size === 4 ? 3 : 4;
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const player = board[r * size + c];
        if (!player) continue;
        for (const [dr, dc] of directions) {
          const line = [r * size + c];
          for (let i = 1; i < winCount; i++) {
            const nr = r + dr * i;
            const nc = c + dc * i;
            if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr * size + nc] === player) {
              line.push(nr * size + nc);
            } else break;
          }
          if (line.length === winCount) return { winner: player, line };
        }
      }
    }
    if (board.every(cell => cell !== null)) return { winner: 'Draw' as const, line: null };
    return null;
  }, []);

  const handleCellClick = (index: number) => {
    initAudio();
    if (gameState.winner || gameState.board[index]) return;

    const subject = gameState.selectedSubject;
    if (!subject || subject.questions.length === 0) {
      // Fallback if no questions
      placeMark(index);
      return;
    }

    // Filter out used questions
    let availableQuestions = subject.questions.filter(q => !gameState.usedQuestionIds.includes(q.id));
    
    // If all questions used, reset the pool for this subject session
    if (availableQuestions.length === 0) {
      availableQuestions = subject.questions;
    }

    const randomQuestion = availableQuestions[Math.floor(Math.random() * availableQuestions.length)];
    setGameState(prev => ({
      ...prev,
      pendingCellIndex: index,
      currentQuestion: randomQuestion,
      usedQuestionIds: [...prev.usedQuestionIds, randomQuestion.id],
      timeLeft: 15,
      isTimerActive: true,
    }));
  };

  const handleAnswer = (optionIndex: number) => {
    const { currentQuestion, pendingCellIndex } = gameState;
    if (!currentQuestion || pendingCellIndex === null) return;

    if (optionIndex === currentQuestion.correctAnswer) {
      playSound('correct');
      placeMark(pendingCellIndex);
    } else {
      if (optionIndex !== -1) playSound('incorrect');
      setGameState(prev => ({
        ...prev,
        pendingCellIndex: null,
        currentQuestion: null,
        currentPlayer: prev.currentPlayer === 'X' ? 'O' : 'X',
        isTimerActive: false,
      }));
    }
  };

  const placeMark = (index: number) => {
    const newBoard = [...gameState.board];
    newBoard[index] = gameState.currentPlayer;
    playSound('click');

    const result = checkWinner(newBoard, gameState.size);
    if (result) {
      if (result.winner === 'Draw') playSound('draw');
      else {
        playSound('win');
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: result.winner === 'X' ? ['#3b82f6', '#60a5fa', '#ffffff'] : ['#f43f5e', '#fb7185', '#ffffff']
        });
      }
      setGameState(prev => ({
        ...prev,
        board: newBoard,
        winner: result ? result.winner : null,
        winningLine: result ? result.line : null,
        score: result && result.winner !== 'Draw' ? { ...prev.score, [result.winner]: prev.score[result.winner as Player] + 1 } : prev.score,
        pendingCellIndex: null,
        currentQuestion: null,
        isTimerActive: false,
      }));
    } else {
      setGameState(prev => ({
        ...prev,
        board: newBoard,
        currentPlayer: prev.currentPlayer === 'X' ? 'O' : 'X',
        pendingCellIndex: null,
        currentQuestion: null,
        isTimerActive: false,
      }));
    }
  };

  const selectSubject = (subject: Subject) => {
    initAudio();
    setGameState(prev => ({ ...prev, selectedSubject: subject }));
    setSettingsSubject(subject);
    setView('settings');
  };

  const openSettings = (subject: Subject) => {
    initAudio();
    setSettingsSubject(subject);
    setView('settings');
  };

  const startNewGame = (size: BoardSize) => {
    playSound('start');
    setGameState(prev => ({
      ...prev,
      size,
      board: Array(size * size).fill(null),
      currentPlayer: 'X',
      winner: null,
      winningLine: null,
      pendingCellIndex: null,
      currentQuestion: null,
      usedQuestionIds: [],
    }));
    setView('game');
  };

  const resetGame = () => {
    playSound('start');
    setGameState(prev => ({
      ...prev,
      board: Array(prev.size * prev.size).fill(null),
      currentPlayer: 'X',
      winner: null,
      winningLine: null,
      pendingCellIndex: null,
      currentQuestion: null,
      usedQuestionIds: [],
    }));
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !settingsSubject) return;
    
    setIsGenerating(true);
    setGenerationError(null);
    
    try {
      const file = files[0];
      const newQuestions = await generateQuestions(file);
      
      if (newQuestions.length > 0) {
        const formattedQuestions: Question[] = newQuestions.map((q, idx) => ({
          id: `gen-${Date.now()}-${idx}`,
          text: q.text,
          options: q.options,
          correctAnswer: q.correctAnswer
        }));

        setGameState(prev => {
          const updatedSubject = { ...settingsSubject, questions: formattedQuestions };
          return {
            ...prev,
            selectedSubject: updatedSubject
          };
        });
        
        setSettingsSubject(prev => prev ? { ...prev, questions: formattedQuestions } : null);
        playSound('correct');
      }
    } catch (error: any) {
      console.error("Generation error:", error);
      setGenerationError(error.message || "Có lỗi xảy ra khi tạo câu hỏi.");
      playSound('incorrect');
    } finally {
      setIsGenerating(false);
    }
  };

  const updateQuestion = (questionId: string, updatedData: Partial<Question>) => {
    if (!settingsSubject) return;

    const updatedQuestions = settingsSubject.questions.map(q => 
      q.id === questionId ? { ...q, ...updatedData } : q
    );

    const updatedSubject = { ...settingsSubject, questions: updatedQuestions };
    
    setGameState(prev => ({
      ...prev,
      selectedSubject: updatedSubject
    }));
    
    setSettingsSubject(updatedSubject);
    setEditingQuestionId(null);
  };

  const deleteQuestion = (questionId: string) => {
    if (!settingsSubject) return;

    const updatedQuestions = settingsSubject.questions.filter(q => q.id !== questionId);
    const updatedSubject = { ...settingsSubject, questions: updatedQuestions };

    setGameState(prev => ({
      ...prev,
      selectedSubject: updatedSubject
    }));

    setSettingsSubject(updatedSubject);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-800 overflow-x-hidden">
      {/* Header */}
      <header className="bg-white border-b border-slate-100 py-4 px-8 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
            <Cpu size={24} />
          </div>
          <span className="text-2xl font-black text-green-600 tracking-tight uppercase">Game CaroEdu</span>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={toggleMusic}
            className={`p-2 rounded-xl transition-all flex items-center gap-2 font-bold text-sm ${
              isMusicEnabled ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-400'
            }`}
          >
            {isMusicEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
            {isMusicEnabled ? 'Nhạc: Bật' : 'Nhạc: Tắt'}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-8 relative">
        <AnimatePresence mode="wait">
          {view === 'home' ? (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full"
            >
              <header className="mb-12 text-center">
                <h1 className="text-5xl font-black mb-3 text-red-700 uppercase">🎓 Game CaroEdu 🎓</h1>
                <p className="text-slate-500 font-medium text-lg">Học tập qua từng nước cờ</p>
              </header>

              <section>
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-black text-slate-800">Chọn môn học để thi đấu</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {SUBJECTS.map((sub) => (
                    <SubjectCard 
                      key={sub.id} 
                      subject={sub} 
                      onPlay={() => selectSubject(sub)} 
                    />
                  ))}
                </div>
              </section>
            </motion.div>
          ) : view === 'settings' ? (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-4xl mx-auto"
            >
              <div className="flex items-center gap-4 mb-8">
                <button 
                  onClick={() => setView('home')}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-blue-600 cursor-pointer"
                >
                  <ChevronLeft size={24} />
                </button>
                <h2 className="text-2xl font-back text-blue-600 tracking-tight uppercase">Cài đặt trò chơi: {settingsSubject?.name}</h2>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                  <div className="bg-white rounded-[40px] p-10 shadow-xl border border-slate-100 space-y-8">
                    <h3 className="text-xl font-black flex items-center gap-2">
                      <Settings className="text-blue-600" />
                      Cấu hình câu hỏi
                    </h3>
                    <div className="grid gap-6">
                      {isGenerating && (
                        <div className="p-6 bg-blue-50 border border-blue-100 rounded-3xl flex items-center gap-4 animate-pulse">
                          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                          <span className="font-bold text-blue-700">Đang phân tích tài liệu và tạo câu hỏi...</span>
                        </div>
                      )}
                      {generationError && (
                        <div className="p-6 bg-rose-50 border border-rose-100 rounded-3xl text-rose-600 font-bold">
                          {generationError}
                        </div>
                      )}
                      <FileUploadSection 
                        icon={<FileText className="text-blue-500" />}
                        title="Tải file câu hỏi (Word, PDF, Text)"
                        description="Hệ thống AI sẽ tự động tạo tối đa 20 câu hỏi từ nội dung file"
                        accept=".docx,.doc,.pdf,.txt,.csv,.json"
                        onFileSelect={handleFileUpload}
                        disabled={isGenerating}
                      />
                      <FileUploadSection 
                        icon={<ImageIcon className="text-rose-500" />}
                        title="Tải ảnh minh họa"
                        description="Hệ thống AI sẽ tạo câu hỏi từ nội dung hình ảnh"
                        accept="image/*"
                        onFileSelect={handleFileUpload}
                        disabled={isGenerating}
                      />
                    </div>
                  </div>

                  {/* Question List & Editor */}
                  {settingsSubject && settingsSubject.questions.length > 0 && (
                    <div className="bg-white rounded-[40px] p-10 shadow-xl border border-slate-100 space-y-8">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xl font-black flex items-center gap-2">
                          <FileText className="text-blue-600" />
                          Danh sách câu hỏi ({settingsSubject.questions.length})
                        </h3>
                      </div>
                      
                      <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                        {settingsSubject.questions.map((q, qIdx) => (
                          <div key={q.id} className="p-6 rounded-3xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:shadow-md transition-all">
                            {editingQuestionId === q.id ? (
                              <div className="space-y-4">
                                <div>
                                  <label className="block text-xs font-black text-slate-400 uppercase mb-2">Câu hỏi {qIdx + 1}</label>
                                  <textarea 
                                    className="w-full p-4 rounded-2xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none font-bold text-slate-700"
                                    defaultValue={q.text}
                                    rows={2}
                                    onBlur={(e) => updateQuestion(q.id, { text: e.target.value })}
                                  />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {q.options.map((opt, oIdx) => (
                                    <div key={oIdx} className="relative">
                                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Lựa chọn {String.fromCharCode(65 + oIdx)}</label>
                                      <div className="flex items-center gap-2">
                                        <input 
                                          type="radio"
                                          name={`correct-${q.id}`}
                                          checked={q.correctAnswer === oIdx}
                                          onChange={() => updateQuestion(q.id, { correctAnswer: oIdx })}
                                          className="w-4 h-4 text-blue-600"
                                        />
                                        <input 
                                          className="flex-1 p-3 rounded-xl border border-slate-200 focus:border-blue-500 outline-none text-sm font-bold"
                                          defaultValue={opt}
                                          onBlur={(e) => {
                                            const newOptions = [...q.options];
                                            newOptions[oIdx] = e.target.value;
                                            updateQuestion(q.id, { options: newOptions });
                                          }}
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                  <button 
                                    onClick={() => setEditingQuestionId(null)}
                                    className="px-4 py-2 bg-slate-200 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-300 transition-colors"
                                  >
                                    Xong
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">Câu {qIdx + 1}</span>
                                    <h4 className="font-bold text-slate-800">{q.text}</h4>
                                  </div>
                                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                    {q.options.map((opt, oIdx) => (
                                      <div key={oIdx} className={`text-xs font-medium ${q.correctAnswer === oIdx ? 'text-emerald-600 font-bold' : 'text-slate-400'}`}>
                                        {String.fromCharCode(65 + oIdx)}. {opt}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                  <button 
                                    onClick={() => setEditingQuestionId(q.id)}
                                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                                    title="Chỉnh sửa"
                                  >
                                    <Settings size={18} />
                                  </button>
                                  <button 
                                    onClick={() => deleteQuestion(q.id)}
                                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                                    title="Xóa"
                                  >
                                    <RotateCcw size={18} className="rotate-45" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-8">
                  <div className="bg-white rounded-[40px] p-10 shadow-xl border border-slate-100">
                    <h3 className="text-xl font-black mb-8 flex items-center gap-2">
                      <Monitor className="text-purple-600" />
                      Kích thước bàn cờ
                    </h3>
                    <div className="flex flex-col gap-4">
                      <button 
                        onClick={() => startNewGame(4)}
                        className="w-full py-4 bg-blue-50 text-blue-600 rounded-2xl font-black text-lg hover:bg-blue-600 hover:text-white transition-all shadow-sm cursor-pointer"
                      >
                        Bàn cờ 4x4
                      </button>
                      <button 
                        onClick={() => startNewGame(5)}
                        className="w-full py-4 bg-purple-50 text-purple-600 rounded-2xl font-black text-lg hover:bg-purple-600 hover:text-white transition-all shadow-sm cursor-pointer"
                      >
                        Bàn cờ 5x5
                      </button>
                      <button 
                        onClick={() => startNewGame(6)}
                        className="w-full py-4 bg-rose-50 text-rose-600 rounded-2xl font-black text-lg hover:bg-rose-600 hover:text-white transition-all shadow-sm cursor-pointer"
                      >
                        Bàn cờ 6x6
                      </button>
                    </div>
                  </div>

                  <div className="bg-blue-600 rounded-[40px] p-8 text-white shadow-xl shadow-blue-200">
                    <h3 className="font-black mb-4 flex items-center gap-2">
                      <Info size={20} />
                      Thông tin
                    </h3>
                    <p className="text-sm opacity-90 leading-relaxed font-medium">
                      Hãy đảm bảo bạn đã tải lên đủ câu hỏi cho môn học này trước khi bắt đầu. Mỗi nước đi sẽ yêu cầu trả lời một câu hỏi ngẫu nhiên.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="game"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="h-full flex flex-col"
            >
              <div className="flex items-center justify-between mb-8">
                <button 
                  onClick={() => setView('home')}
                  className="flex items-center gap-2 text-slate-400 hover:text-blue-600 font-bold transition-colors bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-100 cursor-pointer"
                >
                  <ChevronLeft size={20} />
                  Quay lại
                </button>
                <div className="text-center">
                  <h2 className="text-3xl font-black text-blue-600 tracking-tight uppercase">Caro {gameState.size}x{gameState.size} Đối Kháng</h2>
                  <p className="text-sm text-slate-400 font-bold uppercase tracking-widest">{gameState.selectedSubject?.name}</p>
                </div>
                <div className="w-24" />
              </div>

              <div className="flex flex-col lg:flex-row gap-10 items-center lg:items-start justify-center">
                {/* Info Panel */}
                <div className="w-full lg:w-72 space-y-6 shrink-0">
                  <div className="bg-white rounded-3xl p-6 shadow-md border border-slate-100">
                    <div className="flex items-center gap-2 text-slate-400 mb-4 font-bold text-sm">
                      <User size={16} />
                      Lượt chơi hiện tại
                    </div>
                    <div className={`p-5 rounded-2xl text-center font-black text-xl transition-all shadow-inner ${
                      gameState.currentPlayer === 'X' ? 'bg-blue-50 text-blue-600' : 'bg-rose-50 text-rose-600'
                    }`}>
                      Đội {gameState.currentPlayer}
                    </div>
                  </div>

                  <div className="bg-white rounded-3xl p-6 shadow-md border border-slate-100">
                    <h3 className="font-black text-lg mb-4 flex items-center gap-2">
                      <Trophy size={20} className="text-yellow-500" />
                      Tỉ số
                    </h3>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center p-3 bg-blue-50 rounded-xl">
                        <span className="font-black text-blue-600">Đội X</span>
                        <span className="text-2xl font-black">{gameState.score.X}</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-rose-50 rounded-xl">
                        <span className="font-black text-rose-600">Đội O</span>
                        <span className="text-2xl font-black">{gameState.score.O}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-800 text-white rounded-3xl p-6 shadow-lg">
                    <div className="flex items-center gap-2 mb-4 font-bold text-sm opacity-80">
                      <Info size={16} />
                      Luật chơi
                    </div>
                    <ul className="text-xs space-y-3 opacity-90 font-medium leading-relaxed">
                      <li className="flex gap-2"><span>•</span> Chọn 1 ô trống trên bàn cờ</li>
                      <li className="flex gap-2"><span>•</span> Trả lời đúng câu hỏi để chiếm ô</li>
                      <li className="flex gap-2"><span>•</span> Trả lời sai sẽ mất lượt</li>
                      <li className="flex gap-2"><span>•</span> Đội đầu tiên có {gameState.size === 4 ? 3 : 4} ô liên tiếp sẽ thắng</li>
                    </ul>
                  </div>
                </div>

                {/* Board Container */}
                <div className="bg-white p-6 md:p-10 rounded-[48px] shadow-2xl border border-slate-100 relative">
                  <div 
                    className="grid gap-3 md:gap-4"
                    style={{ 
                      gridTemplateColumns: `repeat(${gameState.size}, minmax(0, 1fr))`,
                      width: 'min(85vw, 550px)'
                    }}
                  >
                    {gameState.board.map((cell, i) => {
                      const isWinningCell = gameState.winningLine?.includes(i);
                      return (
                        <motion.button
                          key={i}
                          whileHover={!cell && !gameState.winner ? { 
                            scale: 1.05, 
                            backgroundColor: '#eff6ff',
                            borderColor: '#bfdbfe',
                            boxShadow: '0 10px 15px -3px rgba(59, 130, 246, 0.1)'
                          } : {}}
                          whileTap={!cell && !gameState.winner ? { scale: 0.95 } : {}}
                          onClick={() => handleCellClick(i)}
                          className={`aspect-square rounded-2xl md:rounded-3xl flex items-center justify-center text-3xl md:text-5xl font-black transition-all duration-500 border-2 relative overflow-hidden cursor-pointer ${
                            cell === 'X' ? 'bg-gradient-to-br from-blue-500 to-blue-700 text-white border-blue-400 shadow-xl shadow-blue-200' : 
                            cell === 'O' ? 'bg-gradient-to-br from-rose-500 to-rose-700 text-white border-rose-400 shadow-xl shadow-rose-200' : 
                            'bg-white border-slate-100'
                          } ${
                            isWinningCell ? 'ring-8 ring-yellow-400 ring-offset-4 z-10 scale-105' : ''
                          }`}
                        >
                          {cell && (
                            <div className="absolute inset-0 bg-white/20 pointer-events-none" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 30%, 0 70%)' }} />
                          )}
                          <AnimatePresence mode="wait">
                            {cell && (
                              <motion.span
                                initial={{ scale: 0, opacity: 0, rotate: -15 }}
                                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                              >
                                {cell}
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Winner Modal */}
        <AnimatePresence>
          {gameState.winner && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-white rounded-[48px] p-12 max-w-sm w-full text-center shadow-2xl border border-white/20"
              >
                <div className="w-24 h-24 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
                  <Trophy size={48} />
                </div>
                <h2 className="text-4xl font-black text-slate-800 mb-3">
                  {gameState.winner === 'Draw' ? 'HÒA RỒI!' : 'CHIẾN THẮNG!'}
                </h2>
                <p className="text-slate-500 mb-10 font-bold text-lg">
                  {gameState.winner === 'Draw' 
                    ? 'Cả hai đội đều rất xuất sắc.' 
                    : `Chúc mừng Đội ${gameState.winner} đã thắng cuộc!`}
                </p>
                <button
                  onClick={resetGame}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-5 rounded-3xl font-black text-xl shadow-xl shadow-blue-100 transition-all flex items-center justify-center gap-3"
                >
                  <RotateCcw size={28} />
                  CHƠI LẠI
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Question Modal */}
        <AnimatePresence>
          {gameState.currentQuestion && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-white rounded-[40px] p-10 max-w-2xl w-full shadow-2xl border border-white/20"
              >
                <div className="mb-8 flex justify-between items-start">
                  <div>
                    <span className="text-xs font-black text-blue-600 bg-blue-50 px-4 py-2 rounded-full uppercase tracking-widest mb-4 inline-block">
                      Câu hỏi thử thách
                    </span>
                    <h3 className="text-2xl font-black text-slate-800 leading-tight">
                      {gameState.currentQuestion.text}
                    </h3>
                  </div>
                  <div className="flex flex-col items-center shrink-0">
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black shadow-lg border-4 transition-all ${
                      gameState.timeLeft <= 3 ? 'bg-rose-50 text-rose-600 border-rose-200 animate-bounce' : 'bg-blue-50 text-blue-600 border-blue-200'
                    }`}>
                      {gameState.timeLeft}
                    </div>
                    <span className="text-[10px] font-black text-slate-400 uppercase mt-2">Giây</span>
                  </div>
                </div>

                {/* Timer Progress Bar */}
                <div className="w-full h-2 bg-slate-100 rounded-full mb-8 overflow-hidden">
                  <motion.div 
                    initial={{ width: '100%' }}
                    animate={{ width: `${(gameState.timeLeft / 15) * 100}%` }}
                    transition={{ duration: 1, ease: 'linear' }}
                    className={`h-full rounded-full ${
                      gameState.timeLeft <= 3 ? 'bg-rose-500' : 'bg-blue-500'
                    }`}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {gameState.currentQuestion.options.map((option, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleAnswer(idx)}
                      className="p-6 text-left rounded-2xl border-2 border-slate-100 hover:border-blue-500 hover:bg-blue-50 transition-all font-bold text-slate-700 hover:text-blue-700 flex items-center gap-4 group cursor-pointer"
                    >
                      <span className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-blue-600 group-hover:text-white flex items-center justify-center text-lg transition-colors">
                        {String.fromCharCode(65 + idx)}
                      </span>
                      {option}
                    </button>
                  ))}
                </div>

                <div className="mt-8 pt-8 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full animate-pulse ${gameState.currentPlayer === 'X' ? 'bg-blue-600' : 'bg-rose-600'}`} />
                    <span className="text-sm font-bold text-slate-400">
                      Đội {gameState.currentPlayer} đang trả lời...
                    </span>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

const SubjectCard: React.FC<{ subject: Subject, onPlay: () => void }> = ({ subject, onPlay }) => {
  return (
    <div 
      onClick={onPlay}
      className="bg-white rounded-[40px] p-8 shadow-lg border border-slate-100 flex flex-col h-full group hover:shadow-xl transition-all duration-300 hover:-translate-y-1 cursor-pointer"
    >
      <div className="flex justify-between items-start mb-8">
        <div className={`w-16 h-16 ${subject.color} text-white rounded-3xl flex items-center justify-center shadow-2xl shadow-current/30 group-hover:scale-110 transition-transform duration-300`}>
          {React.cloneElement(subject.icon as React.ReactElement, { size: 32 })}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100 uppercase tracking-wider">
            {subject.questions.length} câu hỏi
          </span>
        </div>
      </div>
      <h3 className="text-2xl font-black mb-8 text-slate-800">{subject.name}</h3>
      <div className="mt-auto space-y-3">
        <button 
          onClick={onPlay}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black text-sm shadow-lg shadow-blue-100 transition-all flex items-center justify-center gap-2 group-hover:gap-3 cursor-pointer"
        >
          <Play size={18} fill="currentColor" />
          Bắt đầu chơi
        </button>
      </div>
    </div>
  );
};

const FileUploadSection: React.FC<{ 
  icon: React.ReactNode, 
  title: string, 
  description: string, 
  accept?: string, 
  multiple?: boolean,
  onFileSelect?: (files: FileList | null) => void,
  disabled?: boolean
}> = ({ icon, title, description, accept, multiple, onFileSelect, disabled }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div 
      className={`flex flex-col md:flex-row items-center gap-6 p-6 rounded-3xl border-2 border-dashed transition-all group ${
        disabled 
          ? 'opacity-50 cursor-not-allowed border-slate-200' 
          : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 cursor-pointer'
      }`} 
      onClick={() => !disabled && fileInputRef.current?.click()}
    >
      <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <div className="flex-1 text-center md:text-left">
        <h4 className="text-lg font-black text-slate-800 mb-1">{title}</h4>
        <p className="text-sm text-slate-400 font-medium">{description}</p>
      </div>
      <div className={`px-6 py-3 bg-white rounded-xl font-bold text-sm shadow-sm border border-slate-100 transition-all flex items-center gap-2 ${
        disabled ? 'text-slate-300' : 'text-slate-600 group-hover:bg-blue-600 group-hover:text-white'
      }`}>
        <Upload size={16} />
        Chọn tệp
      </div>
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept={accept} 
        multiple={multiple}
        disabled={disabled}
        onChange={(e) => onFileSelect?.(e.target.files)}
      />
    </div>
  );
};
