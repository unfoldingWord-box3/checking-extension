import React, { useState } from 'react'
import ChapterVerseSelector from './components/ChapterVerseSelector'
import TranslationNotesView from './components/TranslationNotesView'




const App = () => {
  const [chapter, setChapter] = useState<number>(1);
  const [verse, setVerse] = useState<number>(1);

  const handleChapterChange = (newChapter: number) => {
    setChapter(newChapter);
  };

  const handleVerseChange = (newVerse: number) => {
    setVerse(newVerse);
  };

  return (
    <div>
      <ChapterVerseSelector 
        chapter={chapter} 
        verse={verse} 
        onChapterChange={handleChapterChange} 
        onVerseChange={handleVerseChange} 
      />
      <TranslationNotesView chapter={chapter} verse={verse} />
    </div>
  )
}

export default App
