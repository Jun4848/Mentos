import { useNavigate } from "react-router-dom";

const AdminPage = () => {
    const nav = useNavigate()
    return(
        <div>
            <button onClick={()=>{nav("/")}}>로그인페이지</button>
            <h1>어드민페이지입니다.</h1>
        </div>
    )
};

export default AdminPage;