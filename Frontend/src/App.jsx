import './App.css'
import LoginPage from './LoginPage'
import MainPage from './MainPage'
import AdminPage from './AdminPage';
import { Routes,Route } from "react-router-dom";
import { useState } from 'react';

function App() {
  const [day,setDay] = useState("점심")


  return (
    <>
      <Routes>
        <Route path='/' element={<LoginPage/>}></Route>
        <Route path='/main' element={<MainPage day={day}/>}></Route>
        <Route path='/admin' element={<AdminPage/>}></Route>
      </Routes>
    </>
  )
}

export default App
