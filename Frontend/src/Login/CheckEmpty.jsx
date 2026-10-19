const CheckEmpty = ({Id,Password})=>{
<<<<<<< HEAD
    if (!Id){
=======
    if (!Id){ 
>>>>>>> 43780d825588cb26ee65ac8505813cb660f2e035
        alert("아이디를 입력해주세요!")
    }else if(!Password){
        alert("비밀번호를 입력해주세요!")
    }else{
        console.log("Id : "+ Id )
        console.log("Password : "+ Password )
    }
}

export default CheckEmpty;