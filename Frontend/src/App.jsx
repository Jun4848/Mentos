import './App.css'
import LoginPage from './Login/LoginPage'
import MainPage from './MainPage'
import AdminPage from './AdminPage';
import AdminAttendanceHistoryPage from './AdminAttendanceHistoryPage';
import StudentMainGate from './StudentMainGate';
import { Routes,Route,Navigate } from "react-router-dom";
import { useEffect, useState } from 'react';

function App() {
  const [MainId,setMainId] = useState("");
  const [MainName,setMainName] = useState("");
  const [MainRole,setMainRole] = useState("");
  const [Rn,setRn] = useState("")
  const [Stat,setStat] = useState("")
  const [IsChecked,setIsChecked] = useState(false);
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
          setIsChecked(data.isChecked === true);
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
        <Route path='/' element={<LoginPage setMainId={setMainId} setMainName={setMainName} setMainRole={setMainRole} setRn={setRn} setStat={setStat} setIsChecked={setIsChecked}/>}></Route>
        <Route path='/main' element={MainRole === "ADMIN" ? <Navigate to="/admin" replace/> : MainId && MainRole === "STUDENT" ? <StudentMainGate><MainPage Id={MainId} Name={MainName} Rn={Rn} Stat={Stat} IsChecked={IsChecked} setMainId={setMainId} setMainName={setMainName} setMainRole={setMainRole} setRn={setRn} setStat={setStat} setIsChecked={setIsChecked}/></StudentMainGate> : <Navigate to="/" replace/>}></Route>
        <Route path='/admin/attendance-history' element={MainRole === "ADMIN" ? <AdminAttendanceHistoryPage setMainId={setMainId} setMainName={setMainName} setMainRole={setMainRole} setRn={setRn} setStat={setStat} setIsChecked={setIsChecked}/> : <Navigate to="/" replace/>}/>
        <Route path='/admin' element={MainRole === "ADMIN" ? <AdminPage Id={MainId} Name={MainName} Rn={Rn} Stat={Stat} setMainId={setMainId} setMainName={setMainName} setMainRole={setMainRole} setRn={setRn} setStat={setStat} setIsChecked={setIsChecked}/> : <Navigate to="/" replace/>}></Route>
      </Routes>
    </>
  )
}

export default App
