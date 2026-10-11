import { useNavigate } from "react-router-dom";

const MainPage = () => {
    const nav = useNavigate()
    return(
        <div>
            <button onClick={()=>{nav("/")}}>로그인페이지</button>
            <h1>메인페이지입니다.</h1>
        </div>
    )
};

export default MainPage;