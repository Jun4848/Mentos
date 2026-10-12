import { useNavigate } from "react-router-dom";

const MainPage = ({day}) => {
    const nav = useNavigate()
    return(
        <div>
            <div>
                <div>
                    <h1>학생 학번 + 이름</h1>
                </div>
                <div>
                    <h1>{day}시간</h1>
                    <button>출석체크</button>
                </div>
            </div>
        </div>
    )
};

export default MainPage;