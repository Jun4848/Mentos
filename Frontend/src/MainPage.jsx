import { useNavigate } from "react-router-dom";
import schoolLogo from "./schoollogo.png";

const MainPage = ({day}) => {
    const nav = useNavigate()
    return(
        <div>
            <div>
                <div className="w-screen h-20 bg-emerald-600 flex flex-row justify-center items-center">
                    <img
                              src={schoolLogo}
                              alt="schoollogo"
                              className="w-15 h-15"
                            />
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