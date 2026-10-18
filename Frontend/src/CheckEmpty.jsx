const CheckEmpty = ({Id,Password})=>{
    if (Id === ""){
        alert("아이디가 비었습니다!")
    }else if(Password === ""){
        alert("비밀번호가 비었습니다!")
    }else{
        console.log(Id, Password);
    }
}

export default CheckEmpty;