import './App.css'

import MainPage from './Main/MainPage'
import AdminPage from './AdminPage';
import { Routes,Route } from "react-router-dom";
import { useState } from 'react';
import LoginPage from './Login/LoginPage';

function App() {
  const [day,setDay] = useState("점심");
  const [MainId,setMainId] = useState("");
  

  return (
    <>
      <Routes>
        <Route path='/' element={<LoginPage/>}></Route>
        <Route path='/main' element={<MainPage day={day} Id={MainId}/>}></Route>
        <Route path='/admin' element={<AdminPage/>}></Route>
      </Routes>
    </>
  )
}

export default App
