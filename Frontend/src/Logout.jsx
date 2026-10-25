const Logout = (nav,{setMainId, setMainName, setMainRole, setRn, setStat})=>{
    setMainId("")
    setMainName("")
    setMainRole("")
    setRn("")
    setStat("")
    nav("/", {replace : true})
}

export default Logout;