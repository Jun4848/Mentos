import { useNavigate } from "react-router-dom";
import { useState } from "react";

import MainPageNav from "./MainPageNav";

const MainPage = ({day, Id, Name}) => {
    const nav = useNavigate()
    const [Status,setStatus] = useState("start") // start = 제출해야됨 | end = 제출기간 마감
    return(
        <div>
            <div>
                <MainPageNav Id={Id} Name={Name}/>
                <div className="flex flex-col justify-center items-center w-screen h-[70vh] gap-5">
                    <h1>{day}시간</h1>
                    <button
                        className="bg-emerald-600 hover:bg-emerald-700 cursor-pointer w-35 h-15 rounded-2xl text-white font-bold"
                    >출석체크</button>
                </div>
            </div>
        </div>
    )
};

export default MainPage;
