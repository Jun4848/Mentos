// 가장 간단한 테스트용 API의 응답을 담당합니다.
function getHome(req, res) {
  res.send('Dormitory Attendance API');
}

module.exports = {
  getHome,
};
