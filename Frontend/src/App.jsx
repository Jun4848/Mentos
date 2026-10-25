import './App.css'
import LoginPage from './Login/LoginPage'
import MainPage from './MainPage'
import AdminPage from './AdminPage';
import { Routes,Route,Navigate } from "react-router-dom";
import { useEffect, useState } from 'react';

function App() {
  const [day] = useState("점심");
  const [MainId,setMainId] = useState("");
  const [MainName,setMainName] = useState("");
  const [MainRole,setMainRole] = useState("");
  const [Rn,setRn] = useState("")
  const [Stat,setStat] = useState("")
  const [CheckingLogin,setCheckingLogin] = useState(true);

  useEffect(() => {
    async function CheckLogin() {
      try {
        const response = await fetch("/api/auth/me", {credentials: "include"});
        if (response.ok) {
          const data = await response.json();
          setMainId(data.id);
          setMainName(data.name);
          setMainRole(data.role);
          setRn(data.roomNumber);
          setStat(data.status);
        }
      } catch {
        return;
      } finally {
        setCheckingLogin(false);
      }
    }
    CheckLogin();
  }, []);

  if (CheckingLogin) return null;

  return (
    <>
      <Routes>
        <Route path='/' element={<LoginPage setMainId={setMainId} setMainName={setMainName} setMainRole={setMainRole} setRn={setRn} setStat={setStat}/>}></Route>
        <Route path='/main' element={MainId ? <MainPage day={day} Id={MainId} Name={MainName} Rn={Rn} Stat={Stat} setMainId={setMainId} setMainName={setMainName} setMainRole={setMainRole} setRn={setRn} setStat={setStat}/> : <Navigate to="/" replace/>}></Route>
        <Route path='/admin' element={MainRole === "ADMIN" ? <AdminPage/> : <Navigate to="/" replace/>}></Route>
      </Routes>
    </>
  )
}

export default App
