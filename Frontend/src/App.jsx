import './App.css'
import LoginForm from './LoginPage'
import MainPage from './MainPage'
import AdminPage from './AdminPage';
import { Routes,Route } from "react-router-dom";

function App() {
  return (
    <>
      <Routes>
        <Route path='/' element={<LoginForm/>}></Route>
        <Route path='/main' element={<MainPage/>}></Route>
        <Route path='/admin' element={<AdminPage/>}></Route>
      </Routes>
    </>
  )
}

export default App
